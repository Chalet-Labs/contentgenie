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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const podcastIndexId = body.podcastIndexId;
    const title = body.title;
    const description = body.description as string | undefined;
    const audioUrl = body.audioUrl as string | undefined;
    const duration = body.duration as number | undefined;
    const publishDate = body.publishDate as string | undefined;
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

    // Ensure user exists
    await db
      .insert(users)
      .values({ id: userId, email: "", name: null })
      .onConflictDoNothing();

    // Upsert podcast
    const [podcastRecord] = await db
      .insert(podcasts)
      .values({
        podcastIndexId: podcast.podcastIndexId as string,
        title: podcast.title as string,
        description: podcast.description as string | undefined,
        publisher: podcast.publisher as string | undefined,
        imageUrl: podcast.imageUrl as string | undefined,
        rssFeedUrl: podcast.rssFeedUrl as string | undefined,
        categories:
          Array.isArray(podcast.categories) && podcast.categories.every((c) => typeof c === "string")
            ? (podcast.categories as string[])
            : undefined,
        totalEpisodes: podcast.totalEpisodes as number | undefined,
      })
      .onConflictDoUpdate({
        target: podcasts.podcastIndexId,
        set: {
          title: podcast.title as string,
          description: podcast.description as string | undefined,
          publisher: podcast.publisher as string | undefined,
          imageUrl: podcast.imageUrl as string | undefined,
          rssFeedUrl: podcast.rssFeedUrl as string | undefined,
          categories:
            Array.isArray(podcast.categories) && podcast.categories.every((c) => typeof c === "string")
              ? (podcast.categories as string[])
              : undefined,
          totalEpisodes: podcast.totalEpisodes as number | undefined,
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
