import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { episodes, userLibrary } from "@/db/schema";
import { upsertPodcast, ensureUserExists } from "@/db/helpers";
import { revalidatePath } from "next/cache";
import { saveEpisodeSchema, safeParseDate } from "@/lib/schemas/library";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Unsupported Media Type" },
        { status: 415 },
      );
    }

    const accept = request.headers.get("accept")?.toLowerCase() ?? "*/*";
    if (!accept.includes("application/json") && !accept.includes("*/*")) {
      return NextResponse.json(
        { success: false, error: "Not Acceptable" },
        { status: 406 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = saveEpisodeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Invalid episode data" },
        { status: 400 },
      );
    }

    const { podcastIndexId, title, description, audioUrl, duration, publishDate, podcast } = result.data;

    const publishDateValue = safeParseDate(publishDate);

    await ensureUserExists(userId);

    // Upsert podcast
    const podcastRecord = {
      id: await upsertPodcast({
        podcastIndexId: podcast.podcastIndexId,
        title: podcast.title,
        description: podcast.description,
        publisher: podcast.publisher,
        imageUrl: podcast.imageUrl,
        rssFeedUrl: podcast.rssFeedUrl,
        categories: podcast.categories,
        totalEpisodes: podcast.totalEpisodes,
      }, { updateOnConflict: false }),
    };

    // Upsert episode
    const [episodeRecord] = await db
      .insert(episodes)
      .values({
        podcastId: podcastRecord.id,
        podcastIndexId,
        title,
        description,
        audioUrl,
        duration,
        publishDate: publishDateValue,
      })
      .onConflictDoUpdate({
        target: episodes.podcastIndexId,
        set: {
          title,
          description,
          audioUrl,
          duration,
          publishDate: publishDateValue,
          updatedAt: new Date(),
        },
      })
      .returning({ id: episodes.id });

    // Insert library entry (idempotent)
    const libraryResult = await db
      .insert(userLibrary)
      .values({ userId, episodeId: episodeRecord.id })
      .onConflictDoNothing()
      .returning({ id: userLibrary.id });

    if (libraryResult.length === 0) {
      return NextResponse.json({ success: true, message: "Episode already in library" });
    }

    revalidatePath("/library");
    revalidatePath(`/episode/${podcastIndexId}`);

    return NextResponse.json({ success: true, message: "Episode saved to library" });
  } catch (error) {
    console.error("Error saving episode to library:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save episode" },
      { status: 500 },
    );
  }
}
