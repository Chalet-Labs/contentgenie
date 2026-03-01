import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, podcasts, episodes, userLibrary } from "@/db/schema";
import { revalidatePath } from "next/cache";

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

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return NextResponse.json(
          { success: false, error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const allowedKeys = new Set([
      "podcastIndexId",
      "title",
      "description",
      "audioUrl",
      "duration",
      "publishDate",
      "podcast",
    ]);
    if (Object.keys(body).some((k) => !allowedKeys.has(k))) {
      return NextResponse.json({ success: false, error: "Invalid episode data" }, { status: 400 });
    }

    const isOptionalString = (v: unknown): v is string | undefined =>
      v === undefined || typeof v === "string";
    const isOptionalNumber = (v: unknown): v is number | undefined =>
      v === undefined || (typeof v === "number" && Number.isFinite(v));

    if (
      !isOptionalString(body.description) ||
      !isOptionalString(body.audioUrl) ||
      !isOptionalNumber(body.duration) ||
      (body.publishDate !== undefined && body.publishDate !== null && typeof body.publishDate !== "string")
    ) {
      return NextResponse.json({ success: false, error: "Invalid episode data" }, { status: 400 });
    }

    const podcastIndexId = body.podcastIndexId;
    const title = body.title;
    const description = typeof body.description === "string" ? body.description : undefined;
    const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl : undefined;
    const duration = typeof body.duration === "number" ? body.duration : undefined;
    const publishDate = typeof body.publishDate === "string" ? body.publishDate : undefined;
    let publishDateValue: Date | undefined;
    if (publishDate != null) {
      const d = new Date(publishDate);
      if (!isNaN(d.getTime())) {
        publishDateValue = d;
      }
    }
    const podcast = body.podcast as Record<string, unknown> | undefined;

    if (
      !podcastIndexId ||
      typeof podcastIndexId !== "string" ||
      !title ||
      typeof title !== "string" ||
      !podcast ||
      !podcast.podcastIndexId ||
      typeof podcast.podcastIndexId !== "string" ||
      !podcast.title ||
      typeof podcast.title !== "string"
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid episode data" },
        { status: 400 },
      );
    }

    const podcastDescription = typeof podcast.description === "string" ? podcast.description : undefined;
    const podcastPublisher = typeof podcast.publisher === "string" ? podcast.publisher : undefined;
    const podcastImageUrl = typeof podcast.imageUrl === "string" ? podcast.imageUrl : undefined;
    const podcastRssFeedUrl = typeof podcast.rssFeedUrl === "string" ? podcast.rssFeedUrl : undefined;
    const podcastTotalEpisodes =
      typeof podcast.totalEpisodes === "number" && Number.isFinite(podcast.totalEpisodes)
        ? podcast.totalEpisodes
        : undefined;
    const podcastCategories =
      Array.isArray(podcast.categories) && podcast.categories.every((c) => typeof c === "string")
        ? (podcast.categories as string[])
        : undefined;

    // Ensure user exists
    await db
      .insert(users)
      .values({ id: userId, email: "", name: null })
      .onConflictDoNothing();

    // Upsert podcast
    const [podcastRecord] = await db
      .insert(podcasts)
      .values({
        podcastIndexId: podcast.podcastIndexId,
        title: podcast.title,
        description: podcastDescription,
        publisher: podcastPublisher,
        imageUrl: podcastImageUrl,
        rssFeedUrl: podcastRssFeedUrl,
        categories: podcastCategories,
        totalEpisodes: podcastTotalEpisodes,
      })
      .onConflictDoUpdate({
        target: podcasts.podcastIndexId,
        set: {
          title: podcast.title,
          description: podcastDescription,
          publisher: podcastPublisher,
          imageUrl: podcastImageUrl,
          rssFeedUrl: podcastRssFeedUrl,
          categories: podcastCategories,
          totalEpisodes: podcastTotalEpisodes,
          updatedAt: new Date(),
        },
      })
      .returning({ id: podcasts.id });

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
