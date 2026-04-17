import { schedules, logger, retry } from "@trigger.dev/sdk";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { podcasts, episodes, userSubscriptions } from "@/db/schema";
import { getEpisodesByFeedId } from "./helpers/podcastindex";
import { fetchTranscriptTask } from "./fetch-transcript";
import { createEpisodeNotifications } from "./helpers/notifications";

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

    // Create episode stubs and trigger transcript fetch for new episodes.
    // fetch-transcript chains into summarize-episode once a transcript is
    // persisted, closing the gap where the poller previously triggered
    // summarize-episode directly (which always failed — no transcript yet).
    if (newEpisodes.length > 0) {
      // Batch-insert episode stubs so persistTranscript has a row to UPDATE.
      // onConflictDoNothing guards against races with other insert paths.
      // .returning() yields only the rows actually inserted (conflicts excluded).
      const inserted = await db
        .insert(episodes)
        .values(
          newEpisodes.map((ep) => ({
            podcastId: podcast.id,
            podcastIndexId: String(ep.id),
            title: ep.title,
            description: ep.description,
            audioUrl: ep.enclosureUrl,
            duration: ep.duration,
            publishDate: ep.datePublished
              ? new Date(ep.datePublished * 1000)
              : null,
            transcriptStatus: "fetching" as const,
          }))
        )
        .onConflictDoNothing({ target: episodes.podcastIndexId })
        .returning({ id: episodes.id, podcastIndexId: episodes.podcastIndexId });

      // Create discovery notifications for newly-inserted episodes.
      // Wrapped in try/catch so a notification failure never blocks batchTrigger.
      try {
        for (const row of inserted) {
          const ep = newEpisodes.find((e) => String(e.id) === row.podcastIndexId);
          const title = ep?.title ?? row.podcastIndexId;
          await createEpisodeNotifications(
            podcast.id,
            row.id,
            row.podcastIndexId,
            podcast.title,
            `New episode: ${title}`
          );
        }
      } catch (notifErr) {
        logger.error("Failed to create episode notifications", {
          feedId: podcast.podcastIndexId,
          error: notifErr instanceof Error ? notifErr.message : String(notifErr),
        });
      }

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
