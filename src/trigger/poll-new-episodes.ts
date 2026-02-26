import { schedules, logger, retry } from "@trigger.dev/sdk";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { podcasts, episodes, userSubscriptions } from "@/db/schema";
import { getEpisodesByFeedId } from "./helpers/podcastindex";
import { summarizeEpisode } from "./summarize-episode";

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
    .where(
      inArray(podcasts.id, subscribedPodcastIds)
    );

  // Separate PodcastIndex-sourced from RSS-sourced
  const podcastIndexFeeds = result.filter((p) => p.source === "podcastindex");
  const rssFeeds = result.filter((p) => p.source === "rss");

  if (rssFeeds.length > 0) {
    logger.info("Skipped RSS-sourced podcasts (not compatible with PodcastIndex API)", {
      count: rssFeeds.length,
    });
  }

  return podcastIndexFeeds;
}

/**
 * Polls a single podcast feed for new episodes, triggers summarization for
 * any episodes not already in the database.
 *
 * Errors are allowed to propagate to the caller; per-feed error isolation is
 * handled by the scheduled task's run loop.
 */
export async function pollSingleFeed(podcast: typeof podcasts.$inferSelect) {
  const feedId = Number(podcast.podcastIndexId);

  // Fetch latest episodes from PodcastIndex (with inline retry)
  const response = await retry.onThrow(
    async () => getEpisodesByFeedId(feedId, 20),
    { maxAttempts: 3 }
  );

  const fetchedEpisodes = response?.items ?? [];

  logger.info("Fetched episodes from PodcastIndex", {
    feedId,
    podcastTitle: podcast.title,
    episodeCount: fetchedEpisodes.length,
  });

  let newEpisodes: typeof fetchedEpisodes = [];
  if (fetchedEpisodes.length > 0) {
    // Deduplicate: find which episodes already exist in DB
    const fetchedIds = fetchedEpisodes.map((ep) => String(ep.id));
    const existingEpisodes = await db
      .select({ podcastIndexId: episodes.podcastIndexId })
      .from(episodes)
      .where(inArray(episodes.podcastIndexId, fetchedIds));

    const existingIds = new Set(existingEpisodes.map((e) => e.podcastIndexId));
    newEpisodes = fetchedEpisodes.filter(
      (ep) => !existingIds.has(String(ep.id))
    );

    logger.info("Deduplication complete", {
      feedId,
      fetched: fetchedEpisodes.length,
      existing: existingIds.size,
      new: newEpisodes.length,
    });

    // Fire-and-forget summarization for new episodes
    if (newEpisodes.length > 0) {
      const batchItems = newEpisodes.map((ep) => ({
        payload: { episodeId: Number(ep.id) },
        options: { idempotencyKey: `poll-summarize-${ep.id}` },
      }));

      await summarizeEpisode.batchTrigger(batchItems);

      logger.info("Triggered summarization for new episodes", {
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
 * every 2 hours and triggers summarization for each new episode.
 *
 * Safety notes:
 * - Concurrent run safety: unique constraints on episodes.podcastIndexId +
 *   idempotent summarize task prevent duplicate work.
 * - Backpressure: summarize-queue has concurrencyLimit of 3.
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
        summarizationsTriggered: 0,
        feedErrors: 0,
      };
    }

    let feedsPolled = 0;
    let newEpisodesFound = 0;
    let summarizationsTriggered = 0;
    let feedErrors = 0;

    // Sequential polling to avoid thundering herd against PodcastIndex API
    for (const podcast of subscribedPodcasts) {
      try {
        const result = await pollSingleFeed(podcast);
        feedsPolled++;
        newEpisodesFound += result.newEpisodes;
        summarizationsTriggered += result.triggered;
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
      summarizationsTriggered,
      feedErrors,
    };

    logger.info("Feed polling complete", summary);

    return summary;
  },
});
