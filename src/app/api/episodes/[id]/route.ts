import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { getEpisodeById, getPodcastById } from "@/lib/podcastindex";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const episodeId = parseInt(params.id, 10);
    if (isNaN(episodeId)) {
      return NextResponse.json(
        { error: "Invalid episode ID" },
        { status: 400 }
      );
    }

    // Fetch episode from PodcastIndex
    const episodeResponse = await getEpisodeById(episodeId);
    if (!episodeResponse?.episode) {
      return NextResponse.json(
        { error: "Episode not found" },
        { status: 404 }
      );
    }

    const episode = episodeResponse.episode;

    // Fetch podcast details
    let podcast = null;
    try {
      const podcastResponse = await getPodcastById(episode.feedId);
      podcast = podcastResponse?.feed || null;
    } catch {
      // Continue without podcast details if fetch fails
      console.log("Failed to fetch podcast details");
    }

    // Check if we have a cached summary in the database
    const cachedEpisode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodeId.toString()),
    });

    let summary = null;
    if (cachedEpisode?.summary && cachedEpisode?.processedAt) {
      summary = {
        summary: cachedEpisode.summary,
        keyTakeaways: cachedEpisode.keyTakeaways || [],
        worthItScore: cachedEpisode.worthItScore
          ? parseFloat(cachedEpisode.worthItScore)
          : null,
      };
    }

    return NextResponse.json({
      episode,
      podcast,
      summary,
    });
  } catch (error) {
    console.error("Error fetching episode:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch episode",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
