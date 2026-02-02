import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes, podcasts } from "@/db/schema";
import { getEpisodeById, getPodcastById } from "@/lib/podcastindex";
import { generateCompletion, parseJsonResponse, SummaryResult } from "@/lib/openrouter";
import { SYSTEM_PROMPT, getSummarizationPrompt } from "@/lib/prompts";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get episode ID from request body
    const body = await request.json();
    const { episodeId } = body;

    if (!episodeId) {
      return NextResponse.json(
        { error: "Episode ID is required" },
        { status: 400 }
      );
    }

    // Check if we already have a cached summary in the database
    const existingEpisode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodeId.toString()),
    });

    if (existingEpisode?.summary && existingEpisode?.processedAt) {
      // Return cached summary
      return NextResponse.json({
        summary: existingEpisode.summary,
        keyTakeaways: existingEpisode.keyTakeaways || [],
        worthItScore: existingEpisode.worthItScore
          ? parseFloat(existingEpisode.worthItScore)
          : null,
        cached: true,
      });
    }

    // Fetch episode details from PodcastIndex
    const episodeResponse = await getEpisodeById(Number(episodeId));
    if (!episodeResponse?.episode) {
      return NextResponse.json(
        { error: "Episode not found" },
        { status: 404 }
      );
    }

    const episode = episodeResponse.episode;

    // Fetch podcast details for context
    const podcastResponse = await getPodcastById(episode.feedId);
    const podcast = podcastResponse?.feed;

    // Fetch transcript if available
    let transcript: string | undefined;
    if (episode.transcripts && episode.transcripts.length > 0) {
      // Try to fetch the transcript
      const transcriptEntry = episode.transcripts.find(
        (t) => t.type === "text/plain" || t.type === "application/srt"
      );
      if (transcriptEntry?.url) {
        try {
          const transcriptResponse = await fetch(transcriptEntry.url);
          if (transcriptResponse.ok) {
            transcript = await transcriptResponse.text();
            // Limit transcript length to avoid token limits
            if (transcript.length > 50000) {
              transcript = transcript.slice(0, 50000) + "\n\n[Transcript truncated...]";
            }
          }
        } catch {
          // Continue without transcript if fetch fails
          console.log("Failed to fetch transcript, continuing without it");
        }
      }
    }

    // Generate summary using OpenRouter
    const prompt = getSummarizationPrompt(
      podcast?.title || "Unknown Podcast",
      episode.title,
      episode.description || "",
      episode.duration || 0,
      transcript
    );

    const completion = await generateCompletion([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);

    // Parse the JSON response
    let summaryResult: SummaryResult;
    try {
      summaryResult = parseJsonResponse<SummaryResult>(completion);
    } catch {
      // If JSON parsing fails, create a basic result
      summaryResult = {
        summary: completion,
        keyTakeaways: [],
        worthItScore: 5,
        worthItReason: "Unable to parse structured response",
      };
    }

    // Ensure or create podcast in database
    let dbPodcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.podcastIndexId, episode.feedId.toString()),
    });

    if (!dbPodcast && podcast) {
      const categories = podcast.categories
        ? Object.values(podcast.categories)
        : [];

      const [newPodcast] = await db
        .insert(podcasts)
        .values({
          podcastIndexId: episode.feedId.toString(),
          title: podcast.title,
          description: podcast.description,
          publisher: podcast.author || podcast.ownerName,
          imageUrl: podcast.artwork || podcast.image,
          rssFeedUrl: podcast.url,
          categories,
          totalEpisodes: podcast.episodeCount,
          latestEpisodeDate: podcast.newestItemPubdate
            ? new Date(podcast.newestItemPubdate * 1000)
            : null,
        })
        .returning();
      dbPodcast = newPodcast;
    }

    // Store or update episode with summary in database
    if (dbPodcast) {
      if (existingEpisode) {
        // Update existing episode
        await db
          .update(episodes)
          .set({
            summary: summaryResult.summary,
            keyTakeaways: summaryResult.keyTakeaways,
            worthItScore: summaryResult.worthItScore.toFixed(2),
            transcription: transcript,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(episodes.id, existingEpisode.id));
      } else {
        // Insert new episode
        await db.insert(episodes).values({
          podcastId: dbPodcast.id,
          podcastIndexId: episodeId.toString(),
          title: episode.title,
          description: episode.description,
          audioUrl: episode.enclosureUrl,
          duration: episode.duration,
          publishDate: episode.datePublished
            ? new Date(episode.datePublished * 1000)
            : null,
          transcription: transcript,
          summary: summaryResult.summary,
          keyTakeaways: summaryResult.keyTakeaways,
          worthItScore: summaryResult.worthItScore.toFixed(2),
          processedAt: new Date(),
        });
      }
    }

    return NextResponse.json({
      summary: summaryResult.summary,
      keyTakeaways: summaryResult.keyTakeaways,
      worthItScore: summaryResult.worthItScore,
      worthItReason: summaryResult.worthItReason,
      cached: false,
    });
  } catch (error) {
    console.error("Error generating summary:", error);
    return NextResponse.json(
      {
        error: "Failed to generate summary",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check if a summary exists
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const episodeId = searchParams.get("episodeId");

    if (!episodeId) {
      return NextResponse.json(
        { error: "Episode ID is required" },
        { status: 400 }
      );
    }

    // Check if we have a cached summary
    const existingEpisode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodeId),
    });

    if (existingEpisode?.summary && existingEpisode?.processedAt) {
      return NextResponse.json({
        exists: true,
        summary: existingEpisode.summary,
        keyTakeaways: existingEpisode.keyTakeaways || [],
        worthItScore: existingEpisode.worthItScore
          ? parseFloat(existingEpisode.worthItScore)
          : null,
        processedAt: existingEpisode.processedAt,
      });
    }

    return NextResponse.json({
      exists: false,
    });
  } catch (error) {
    console.error("Error checking summary:", error);
    return NextResponse.json(
      { error: "Failed to check summary" },
      { status: 500 }
    );
  }
}
