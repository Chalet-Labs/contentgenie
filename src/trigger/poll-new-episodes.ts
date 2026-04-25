import { schedules, logger, retry } from "@trigger.dev/sdk";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { podcasts, episodes, userSubscriptions } from "@/db/schema";
import { asPodcastIndexEpisodeId } from "@/types/ids";
import { getEpisodesByFeedId } from "@/trigger/helpers/podcastindex";
import { fetchTranscriptTask } from "@/trigger/fetch-transcript";
import { createEpisodeNotifications } from "@/trigger/helpers/notifications";

/**
 * Queries podcasts that have at least one active subscriber and are sourced
 * from PodcastIndex (RSS-sourced podcasts have synthetic IDs that would break
 * PodcastIndex API calls).
 */
export async function getSubscribedPodcasts() {
  // Get distinct podcast IDs that have at least one subscriber
  const subscribedPodcastIds = db
    .selectDistinct({ podcastId: userSubscriptions.podcastId })
    .from(userSubscriptions);

  const result = await db
    .select()
    .from(podcasts)
    .where(inArray(podcasts.id, subscribedPodcastIds));

  // Separate PodcastIndex-sourced from RSS-sourced
  const podcastIndexFeeds = result.filter((p) => p.source === "podcastindex");
  const rssFeeds = result.filter((p) => p.source === "rss");

  if (rssFeeds.length > 0) {
    logger.info(
      "Skipped RSS-sourced podcasts (not compatible with PodcastIndex API)",
      {
        count: rssFeeds.length,
      },
    );
  }

  return podcastIndexFeeds;
}

/**
 * Polls a single podcast feed for new episodes, inserts episode stubs and
 * triggers transcript fetching for any episodes not already in the database.
 * fetch-transcript chains into summarize-episode after persisting a transcript.
 *
 * Errors are allowed to propagate to the caller; per-feed error isolation is
 * handled by the scheduled task's run loop.
 */
export async function pollSingleFeed(podcast: typeof podcasts.$inferSelect) {
  const feedId = Number(podcast.podcastIndexId);

  // Fetch latest episodes from PodcastIndex (with inline retry)
  const response = await retry.onThrow(
    async () => getEpisodesByFeedId(feedId, 20),
    { maxAttempts: 3 },
  );

  const fetchedEpisodes = response?.items ?? [];

  logger.info("Fetched episodes from PodcastIndex", {
    feedId,
    podcastTitle: podcast.title,
    episodeCount: fetchedEpisodes.length,
  });

  let newEpisodes: typeof fetchedEpisodes = [];
  if (fetchedEpisodes.length > 0) {
    // Deduplicate for the transcript pipeline: only genuinely-new episodes
    // trigger fetch-transcript. Not used to gate the notification path — see
    // the `upserted` block below for the retry-safe notification flow.
    // PodcastIndex API id (number|string) → branded string.
    const fetchedIds = fetchedEpisodes.map((ep) =>
      asPodcastIndexEpisodeId(String(ep.id)),
    );
    const existingEpisodes = await db
      .select({ podcastIndexId: episodes.podcastIndexId })
      .from(episodes)
      .where(inArray(episodes.podcastIndexId, fetchedIds));

    const existingIds = new Set(existingEpisodes.map((e) => e.podcastIndexId));
    // Reuse fetchedIds (already computed above) to avoid re-branding.
    newEpisodes = fetchedEpisodes.filter(
      (_, i) => !existingIds.has(fetchedIds[i]),
    );

    logger.info("Deduplication complete", {
      feedId,
      fetched: fetchedEpisodes.length,
      existing: existingIds.size,
      new: newEpisodes.length,
    });

    // Upsert ALL fetched episodes with onConflictDoUpdate (no-op self-set).
    // .returning() then yields the row id for every fetched episode — new or
    // previously-inserted. This closes a retry gap: if an earlier poll
    // inserted episode stubs but crashed before creating notifications, the
    // dedup query above would otherwise exclude those episodes on retry and
    // orphan them without a notification row. createEpisodeNotifications
    // remains idempotent via its partial unique index, so already-notified
    // users get no duplicate push.
    const upserted = await db
      .insert(episodes)
      .values(
        fetchedEpisodes.map((ep, i) => ({
          podcastId: podcast.id,
          podcastIndexId: fetchedIds[i], // reuse pre-branded id
          title: ep.title,
          description: ep.description,
          audioUrl: ep.enclosureUrl,
          duration: ep.duration,
          publishDate: ep.datePublished
            ? new Date(ep.datePublished * 1000)
            : null,
          transcriptStatus: "fetching" as const,
        })),
      )
      .onConflictDoUpdate({
        target: episodes.podcastIndexId,
        set: { podcastIndexId: sql`excluded.podcast_index_id` },
      })
      .returning({ id: episodes.id, podcastIndexId: episodes.podcastIndexId });

    // Batch-create discovery notifications for every fetched episode. One
    // subscriber lookup + one prefs lookup + one INSERT across the whole poll,
    // instead of N queries per-episode. Idempotent — only genuinely-new
    // (user, episode) pairs produce a row + push.
    const episodeByPiid = new Map(
      fetchedEpisodes.map((e, i) => [fetchedIds[i], e]), // reuse pre-branded ids
    );
    const notificationBatch = upserted.map((row) => {
      const ep = episodeByPiid.get(row.podcastIndexId);
      return {
        episodeId: row.id,
        podcastIndexEpisodeId: row.podcastIndexId,
        title: podcast.title,
        body: `New episode: ${ep?.title ?? row.podcastIndexId}`,
      };
    });

    try {
      await createEpisodeNotifications(podcast.id, notificationBatch);
    } catch (notifErr) {
      logger.error("Failed to create episode notifications", {
        feedId: podcast.podcastIndexId,
        podcastTitle: podcast.title,
        episodeCount: notificationBatch.length,
        error: notifErr instanceof Error ? notifErr.message : String(notifErr),
        stack: notifErr instanceof Error ? notifErr.stack : undefined,
      });
    }

    // Trigger fetch-transcript only for genuinely-new episodes. Idempotency
    // keys would make duplicates a no-op, but skipping them saves Trigger.dev
    // API calls.
    if (newEpisodes.length > 0) {
      const batchItems = newEpisodes.map((ep) => ({
        payload: {
          episodeId: Number(ep.id),
          enclosureUrl: ep.enclosureUrl,
          description: ep.description,
          transcripts: ep.transcripts,
          triggerSummarize: true,
        },
        options: { idempotencyKey: `poll-fetch-transcript-${ep.id}` },
      }));

      await fetchTranscriptTask.batchTrigger(batchItems);

      logger.info("Triggered transcript fetch for new episodes", {
        feedId,
        count: newEpisodes.length,
      });
    }
  }

  // Update lastPolledAt after successful poll
  await db
    .update(podcasts)
    .set({ lastPolledAt: new Date(), updatedAt: new Date() })
    .where(eq(podcasts.id, podcast.id));

  return { newEpisodes: newEpisodes.length, triggered: newEpisodes.length };
}

/**
 * Scheduled task that polls all subscribed PodcastIndex feeds for new episodes
 * every 2 hours and triggers transcript fetching (which chains into
 * summarization) for each new episode.
 *
 * Safety notes:
 * - Concurrent run safety: unique constraints on episodes.podcastIndexId +
 *   idempotency keys on fetchTranscriptTask.batchTrigger and
 *   summarizeEpisode.trigger prevent duplicate work.
 * - Backpressure: fetch-transcript-queue has no concurrency limit (to avoid
 *   deadlock); summarize-queue has concurrencyLimit of 3.
 * - 300s maxDuration ceiling supports ~150 feeds at current API latency.
 */
export const pollNewEpisodes = schedules.task({
  id: "poll-new-episodes",
  cron: "0 */2 * * *",
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (payload) => {
    logger.info("Starting scheduled feed poll", {
      scheduledTime: payload.timestamp,
    });

    const subscribedPodcasts = await getSubscribedPodcasts();

    logger.info("Found subscribed podcasts to poll", {
      count: subscribedPodcasts.length,
    });

    if (subscribedPodcasts.length === 0) {
      logger.info("No subscribed podcasts to poll, exiting");
      return {
        feedsPolled: 0,
        newEpisodesFound: 0,
        transcriptFetchesTriggered: 0,
        feedErrors: 0,
      };
    }

    let feedsPolled = 0;
    let newEpisodesFound = 0;
    let transcriptFetchesTriggered = 0;
    let feedErrors = 0;

    // Sequential polling to avoid thundering herd against PodcastIndex API
    for (const podcast of subscribedPodcasts) {
      try {
        const result = await pollSingleFeed(podcast);
        feedsPolled++;
        newEpisodesFound += result.newEpisodes;
        transcriptFetchesTriggered += result.triggered;
      } catch (error) {
        feedErrors++;
        logger.error("Failed to poll feed", {
          feedId: podcast.podcastIndexId,
          podcastTitle: podcast.title,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const summary = {
      feedsPolled,
      newEpisodesFound,
      transcriptFetchesTriggered,
      feedErrors,
    };

    logger.info("Feed polling complete", summary);

    return summary;
  },
});
