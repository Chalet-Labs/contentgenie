import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes, episodeTopics, podcasts } from "@/db/schema";
import { upsertPodcast } from "@/db/helpers";
import { asPodcastIndexEpisodeId } from "@/types/ids";
import type { SummaryResult } from "@/lib/openrouter";
import type {
  PodcastIndexPodcast,
  PodcastIndexEpisode,
} from "@/lib/podcastindex";

/**
 * Ensures a podcast exists in the database, creating it if necessary.
 * Delegates to the shared upsertPodcast helper when podcast data is available.
 */
async function ensurePodcast(
  feedId: number,
  podcast?: PodcastIndexPodcast,
): Promise<number | null> {
  if (podcast) {
    const categoryValues = podcast.categories
      ? Object.values(podcast.categories)
      : [];
    const categories = categoryValues.length > 0 ? categoryValues : undefined;

    return upsertPodcast(
      {
        podcastIndexId: feedId.toString(),
        title: podcast.title,
        description: podcast.description,
        publisher: podcast.author || podcast.ownerName,
        imageUrl: podcast.artwork || podcast.image,
        rssFeedUrl: podcast.url,
        categories,
        totalEpisodes: podcast.episodeCount,
        latestEpisodeDate: podcast.newestItemPubdate
          ? new Date(podcast.newestItemPubdate * 1000)
          : undefined,
      },
      { updateOnConflict: "full" },
    );
  }

  const dbPodcast = await db.query.podcasts.findFirst({
    where: eq(podcasts.podcastIndexId, feedId.toString()),
  });
  return dbPodcast?.id ?? null;
}

/**
 * Creates or updates an episode stub with run tracking info so the
 * GET endpoint can discover in-progress runs on page refresh.
 */
export async function trackEpisodeRun(
  episode: PodcastIndexEpisode,
  podcast: PodcastIndexPodcast | undefined,
  runId: string,
): Promise<void> {
  const podcastId = await ensurePodcast(episode.feedId, podcast);
  if (!podcastId) return;

  // PodcastIndex API id (number|string) → branded string.
  const piId = asPodcastIndexEpisodeId(episode.id.toString());

  const existingEp = await db.query.episodes.findFirst({
    where: eq(episodes.podcastIndexId, piId),
  });

  if (existingEp) {
    await db
      .update(episodes)
      .set({
        summaryRunId: runId,
        summaryStatus: "running",
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(episodes.id, existingEp.id));
  } else {
    await db
      .insert(episodes)
      .values({
        podcastId,
        podcastIndexId: piId,
        title: episode.title,
        description: episode.description,
        audioUrl: episode.enclosureUrl,
        duration: episode.duration,
        publishDate: episode.datePublished
          ? new Date(episode.datePublished * 1000)
          : null,
        summaryRunId: runId,
        summaryStatus: "running",
      })
      .onConflictDoNothing({ target: episodes.podcastIndexId });
  }
}

/**
 * Updates the episode's summaryStatus to "summarizing".
 * Non-critical — callers should wrap in try/catch.
 */
export async function updateEpisodeStatus(
  episodeId: number | string,
  status: "summarizing",
): Promise<void> {
  // PodcastIndex API id (number|string from caller) → branded string for DB lookup.
  const piId = asPodcastIndexEpisodeId(String(episodeId));
  await db
    .update(episodes)
    .set({
      summaryStatus: status,
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(episodes.podcastIndexId, piId));
}

// persistTranscript is the sole writer of transcript columns — summarize-episode
// no longer touches them (ADR-027). Called by fetch-transcript after fetching
// from an external source (not on cache-hit paths where source is undefined).
// See ADR-026 for column ownership and ADR-027 for the refactor that removed
// transcript writes from persistEpisodeSummary.
export async function persistTranscript(
  episodeId: number,
  transcript: string,
  source: "podcastindex" | "assemblyai" | "description-url",
): Promise<void> {
  const now = new Date();
  // Trigger payload uses numeric form; brand for DB lookup.
  const piId = asPodcastIndexEpisodeId(String(episodeId));
  const updated = await db
    .update(episodes)
    .set({
      transcription: transcript,
      transcriptSource: source,
      transcriptStatus: "available",
      transcriptFetchedAt: now,
      transcriptError: null,
      transcriptRunId: null,
      updatedAt: now,
    })
    .where(eq(episodes.podcastIndexId, piId))
    .returning({ id: episodes.id });

  if (updated.length === 0) {
    throw new Error(
      `Episode ${episodeId} not found for transcript persistence`,
    );
  }
}

async function persistCategories(
  episodeId: number,
  categories: SummaryResult["categories"],
): Promise<void> {
  if (!categories || categories.length === 0) return;
  // Delete-then-insert to reconcile stale categories on re-summarization.
  // No transaction — benign failure mode matches the existing pattern
  // (summary saved without categories; Trigger.dev retries self-heal).
  // Note: the table is still called `episode_topics` for now (the rename
  // there belongs to A2/#383 — schema work).
  await db.delete(episodeTopics).where(eq(episodeTopics.episodeId, episodeId));
  await db.insert(episodeTopics).values(
    categories.map((c) => ({
      episodeId,
      topic: c.name,
      relevance: c.relevance.toFixed(2),
    })),
  );
}

export async function persistEpisodeSummary(
  episode: PodcastIndexEpisode,
  podcast: PodcastIndexPodcast | undefined,
  summary: SummaryResult,
): Promise<void> {
  const podcastId = await ensurePodcast(episode.feedId, podcast);
  if (!podcastId) {
    throw new Error("Could not find or create podcast in database");
  }

  // PodcastIndex API id (number|string) → branded string.
  const piId = asPodcastIndexEpisodeId(episode.id.toString());

  // May have been created by trackEpisodeRun
  const existingEpisode = await db.query.episodes.findFirst({
    where: eq(episodes.podcastIndexId, piId),
  });

  if (existingEpisode) {
    await db
      .update(episodes)
      .set({
        summary: summary.summary,
        keyTakeaways: summary.keyTakeaways,
        worthItScore: summary.worthItScore.toFixed(2),
        worthItReason: summary.worthItReason,
        worthItDimensions: summary.worthItDimensions ?? null,
        processedAt: new Date(),
        summaryStatus: "completed",
        summaryRunId: null,
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(episodes.id, existingEpisode.id));

    await persistCategories(existingEpisode.id, summary.categories);
  } else {
    const [inserted] = await db
      .insert(episodes)
      .values({
        podcastId,
        podcastIndexId: piId,
        title: episode.title,
        description: episode.description,
        audioUrl: episode.enclosureUrl,
        duration: episode.duration,
        publishDate: episode.datePublished
          ? new Date(episode.datePublished * 1000)
          : null,
        summary: summary.summary,
        keyTakeaways: summary.keyTakeaways,
        worthItScore: summary.worthItScore.toFixed(2),
        worthItReason: summary.worthItReason,
        worthItDimensions: summary.worthItDimensions ?? null,
        summaryStatus: "completed",
        processedAt: new Date(),
      })
      .returning({ id: episodes.id });

    if (inserted) {
      await persistCategories(inserted.id, summary.categories);
    }
  }
}
