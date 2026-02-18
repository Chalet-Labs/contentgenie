import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes, podcasts } from "@/db/schema";
import type { SummaryResult } from "@/lib/openrouter";
import type { PodcastIndexPodcast, PodcastIndexEpisode } from "@/lib/podcastindex";

/**
 * Ensures a podcast exists in the database, creating it if necessary.
 * Uses ON CONFLICT DO NOTHING to handle concurrent inserts gracefully.
 */
async function ensurePodcast(
  feedId: number,
  podcast?: PodcastIndexPodcast
): Promise<number | null> {
  let dbPodcast = await db.query.podcasts.findFirst({
    where: eq(podcasts.podcastIndexId, feedId.toString()),
  });

  if (dbPodcast) return dbPodcast.id;
  if (!podcast) return null;

  const categories = podcast.categories
    ? Object.values(podcast.categories)
    : [];

  const [inserted] = await db
    .insert(podcasts)
    .values({
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
        : null,
    })
    .onConflictDoNothing({ target: podcasts.podcastIndexId })
    .returning();

  if (inserted) return inserted.id;

  // Another process inserted first — re-fetch
  dbPodcast = await db.query.podcasts.findFirst({
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
  runId: string
): Promise<void> {
  const podcastId = await ensurePodcast(episode.feedId, podcast);
  if (!podcastId) return;

  const existingEp = await db.query.episodes.findFirst({
    where: eq(episodes.podcastIndexId, episode.id.toString()),
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
        podcastIndexId: episode.id.toString(),
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
 * Updates the episode's summaryStatus during processing pipeline transitions.
 * Non-critical — callers should wrap in try/catch.
 */
export async function updateEpisodeStatus(
  episodeId: number | string,
  status: "transcribing" | "summarizing"
): Promise<void> {
  await db
    .update(episodes)
    .set({
      summaryStatus: status,
      updatedAt: new Date(),
    })
    .where(eq(episodes.podcastIndexId, String(episodeId)));
}

export async function persistEpisodeSummary(
  episode: PodcastIndexEpisode,
  podcast: PodcastIndexPodcast | undefined,
  summary: SummaryResult,
  transcript?: string
): Promise<void> {
  const podcastId = await ensurePodcast(episode.feedId, podcast);
  if (!podcastId) {
    throw new Error("Could not find or create podcast in database");
  }

  // Check for existing episode (may have been created by trackEpisodeRun)
  const existingEpisode = await db.query.episodes.findFirst({
    where: eq(episodes.podcastIndexId, episode.id.toString()),
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
        transcription: transcript,
        processedAt: new Date(),
        summaryStatus: "completed",
        summaryRunId: null,
        updatedAt: new Date(),
      })
      .where(eq(episodes.id, existingEpisode.id));
  } else {
    await db.insert(episodes).values({
      podcastId,
      podcastIndexId: episode.id.toString(),
      title: episode.title,
      description: episode.description,
      audioUrl: episode.enclosureUrl,
      duration: episode.duration,
      publishDate: episode.datePublished
        ? new Date(episode.datePublished * 1000)
        : null,
      transcription: transcript,
      summary: summary.summary,
      keyTakeaways: summary.keyTakeaways,
      worthItScore: summary.worthItScore.toFixed(2),
      worthItReason: summary.worthItReason,
      worthItDimensions: summary.worthItDimensions ?? null,
      summaryStatus: "completed",
      processedAt: new Date(),
    });
  }
}
