import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes, podcasts } from "@/db/schema";
import { getEpisodeById, getPodcastById } from "@/lib/podcastindex";
import { createRateLimitChecker } from "@/lib/rate-limit";

const PUBLIC_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";
const checkPublicEpisodeRateLimit = createRateLimitChecker({
  points: 60,
  duration: 300,
  keyPrefix: "public-episode-read",
});

function isRssSourced(id: string): boolean {
  return id.startsWith("rss-");
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

function withPublicCache(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", PUBLIC_CACHE_CONTROL);
  return response;
}

function withConditionalPublicCache(
  response: NextResponse,
  isAnonymousRequest: boolean
): NextResponse {
  return isAnonymousRequest ? withPublicCache(response) : response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    const isAnonymousRequest = !userId;

    if (isAnonymousRequest) {
      const rateLimit = await checkPublicEpisodeRateLimit(getClientIp(request));
      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded. Please try again later.",
            retryAfterMs: rateLimit.retryAfterMs,
          },
          { status: 429 }
        );
      }
    }

    const id = params.id;

    // RSS-sourced episode: load from database
    if (isRssSourced(id)) {
      // BOLT OPTIMIZATION: Exclude the high-volume transcription field
      // which is not used in the response.
      // Expected impact: ~90% reduction in data transfer when transcripts are present.
      // Note: Uses column exclusion (vs. whitelist in the PodcastIndex path below)
      // because this query needs nearly all episode fields for response mapping.
      const dbEpisode = await db.query.episodes.findFirst({
        where: eq(episodes.podcastIndexId, id),
        columns: {
          transcription: false,
        },
        with: {
          podcast: true,
        },
      });

      if (!dbEpisode) {
        return NextResponse.json(
          { error: "Episode not found" },
          { status: 404 }
        );
      }

      // Map to the shape the episode detail page expects.
      // Use podcastIndexId ("rss-...") as the id so save/library lookups —
      // which key off podcastIndexId — match the API response. Matches the
      // pattern in src/app/(app)/podcast/[id]/page.tsx:91.
      const episode = {
        id: dbEpisode.podcastIndexId,
        title: dbEpisode.title,
        link: "",
        description: dbEpisode.description ?? "",
        guid: dbEpisode.rssGuid ?? dbEpisode.podcastIndexId,
        datePublished: dbEpisode.publishDate
          ? Math.floor(dbEpisode.publishDate.getTime() / 1000)
          : 0,
        enclosureUrl: dbEpisode.audioUrl ?? "",
        duration: dbEpisode.duration ?? 0,
        episode: null,
        episodeType: "full",
        season: 0,
        image: "",
        feedImage: dbEpisode.podcast?.imageUrl ?? "",
        feedId: dbEpisode.podcastId,
      };

      const podcast = dbEpisode.podcast
        ? {
            id: dbEpisode.podcast.podcastIndexId,
            title: dbEpisode.podcast.title,
            author: dbEpisode.podcast.publisher ?? "",
            ownerName: dbEpisode.podcast.publisher ?? "",
            image: dbEpisode.podcast.imageUrl ?? "",
            artwork: dbEpisode.podcast.imageUrl ?? "",
            categories: {},
          }
        : null;

      let summary = null;
      if (dbEpisode.summary && dbEpisode.processedAt) {
        summary = {
          summary: dbEpisode.summary,
          keyTakeaways: dbEpisode.keyTakeaways || [],
          worthItScore: dbEpisode.worthItScore
            ? parseFloat(dbEpisode.worthItScore)
            : null,
          worthItReason: dbEpisode.worthItReason ?? undefined,
          worthItDimensions: dbEpisode.worthItDimensions ?? null,
        };
      }

      return withConditionalPublicCache(
        NextResponse.json({
          episode,
          podcast,
          summary,
          transcriptSource: dbEpisode.transcriptSource ?? null,
          transcriptStatus: dbEpisode.transcriptStatus ?? null,
          episodeDbId: dbEpisode.id,
        }),
        isAnonymousRequest
      );
    }

    // PodcastIndex-sourced episode (existing behavior)
    const episodeId = parseInt(id, 10);
    if (isNaN(episodeId)) {
      return NextResponse.json(
        { error: "Invalid episode ID" },
        { status: 400 }
      );
    }

    // Fetch episode from PodcastIndex
    let episodeResponse;
    try {
      episodeResponse = await getEpisodeById(episodeId);
    } catch (error) {
      console.error("Error fetching episode from PodcastIndex:", { episodeId, error });
      return NextResponse.json(
        { error: "Episode not found" },
        { status: 404 }
      );
    }
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
    let summary = null;
    let transcriptSource: "podcastindex" | "assemblyai" | "description-url" | null = null;
    let episodeDbId: number | null = null;
    let transcriptStatus: string | null = null;
    try {
      // BOLT OPTIMIZATION: Selective column fetching to avoid loading large transcription fields
      // when only checking for cached summary data.
      // Expected impact: Significant reduction in DB I/O and memory usage per episode view.
      const cachedEpisode = await db.query.episodes.findFirst({
        where: eq(episodes.podcastIndexId, episodeId.toString()),
        columns: {
          id: true,
          summary: true,
          keyTakeaways: true,
          worthItScore: true,
          worthItReason: true,
          worthItDimensions: true,
          processedAt: true,
          transcriptSource: true,
          transcriptStatus: true,
        },
      });

      transcriptSource = cachedEpisode?.transcriptSource ?? null;
      episodeDbId = cachedEpisode?.id ?? null;
      transcriptStatus = cachedEpisode?.transcriptStatus ?? null;

      if (cachedEpisode?.summary && cachedEpisode?.processedAt) {
        summary = {
          summary: cachedEpisode.summary,
          keyTakeaways: cachedEpisode.keyTakeaways || [],
          worthItScore: cachedEpisode.worthItScore
            ? parseFloat(cachedEpisode.worthItScore)
            : null,
          worthItReason: cachedEpisode.worthItReason ?? undefined,
          worthItDimensions: cachedEpisode.worthItDimensions ?? null,
        };
      }
    } catch {
      // Continue without cached summary if DB query fails
    }

    return withConditionalPublicCache(
      NextResponse.json({
        episode,
        podcast,
        summary,
        transcriptSource,
        transcriptStatus,
        episodeDbId,
      }),
      isAnonymousRequest
    );
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
