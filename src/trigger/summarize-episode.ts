import { task, retry, logger, metadata, AbortTaskRunError } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { getEpisodeById, getPodcastById } from "@/trigger/helpers/podcastindex";
import { generateEpisodeSummary, type SummaryResult } from "@/trigger/helpers/ai-summary";
import { trackEpisodeRun, persistEpisodeSummary, updateEpisodeStatus } from "@/trigger/helpers/database";
import { createNotificationsForSubscribers, resolvePodcastId } from "@/trigger/helpers/notifications";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import type { PodcastIndexEpisode, PodcastIndexPodcast } from "@/lib/podcastindex";
import { fetchTranscriptTask } from "@/trigger/fetch-transcript";

export type SummarizeEpisodePayload = {
  episodeId: number;
};

export const summarizeEpisode = task({
  id: "summarize-episode",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  queue: {
    name: "summarize-queue",
    concurrencyLimit: 3,
  },
  maxDuration: 7200, // 2 hours — retained for safety; actual AssemblyAI wait is in fetch-transcript
  onFailure: async (params: { payload: SummarizeEpisodePayload }) => {
    const { episodeId } = params.payload;
    logger.error("Summarization task failed permanently", { episodeId });
    try {
      await db
        .update(episodes)
        .set({
          summaryStatus: "failed",
          summaryRunId: null,
          processingError: "Summarization failed after maximum retry attempts",
          updatedAt: new Date(),
        })
        .where(eq(episodes.podcastIndexId, String(episodeId)));
    } catch (error) {
      logger.error("Failed to update episode status to failed in database", {
        episodeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    metadata.root.increment("failed", 1);
  },
  run: async (payload: SummarizeEpisodePayload, { ctx }): Promise<SummaryResult> => {
    const { episodeId } = payload;

    // Step 1: Fetch episode from PodcastIndex
    metadata.set("step", "fetching-episode");
    logger.info("Fetching episode from PodcastIndex", { episodeId });

    const episodeResponse = await retry.onThrow(
      async () => getEpisodeById(episodeId),
      { maxAttempts: 3 }
    );

    if (!episodeResponse?.episode) {
      throw new AbortTaskRunError(`Episode ${episodeId} not found`);
    }

    const episode: PodcastIndexEpisode = episodeResponse.episode;
    logger.info("Episode fetched", { title: episode.title, feedId: episode.feedId });

    // Step 2: Fetch podcast context
    metadata.set("step", "fetching-podcast");
    logger.info("Fetching podcast context", { feedId: episode.feedId });

    let podcast: PodcastIndexPodcast | undefined;
    try {
      const podcastResponse = await retry.onThrow(
        async () => getPodcastById(episode.feedId),
        { maxAttempts: 3 }
      );
      podcast = podcastResponse?.feed;
    } catch (error) {
      logger.warn("Failed to fetch podcast context, continuing without it", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Track run in database so the GET endpoint can discover it on page refresh
    try {
      await trackEpisodeRun(episode, podcast, ctx.run.id);
    } catch (error) {
      logger.warn("Failed to track run in database, continuing anyway", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 3: Fetch transcript via dedicated task
    metadata.set("step", "fetching-transcript");
    logger.info("Fetching transcript");

    let transcript: string | undefined;
    let dbTranscriptSource: "podcastindex" | "assemblyai" | "description-url" | null | undefined;

    try {
      const fetchTranscriptResult = await fetchTranscriptTask.triggerAndWait({
        episodeId,
        enclosureUrl: episode.enclosureUrl,
        description: episode.description,
        transcripts: episode.transcripts,
      });

      if (fetchTranscriptResult.ok) {
        transcript = fetchTranscriptResult.output.transcript;
        dbTranscriptSource = fetchTranscriptResult.output.source;
      } else {
        // Child task permanently failed after its retries — treat as no transcript available.
        // Summarization continues without a transcript rather than aborting.
        logger.warn("fetch-transcript task failed permanently, continuing without transcript", { episodeId });
        transcript = undefined;
        dbTranscriptSource = undefined;
      }
    } catch (error) {
      // SDK-level errors (network, serialization, queue) — treat same as ok:false
      logger.warn("fetch-transcript task invocation failed, continuing without transcript", {
        episodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      transcript = undefined;
      dbTranscriptSource = undefined;
    }

    // Step 4: Generate AI summary
    metadata.set("step", "generating-summary");
    logger.info("Generating AI summary");

    try {
      await updateEpisodeStatus(episodeId, "summarizing");
    } catch (error) {
      logger.warn("Failed to update episode status to summarizing", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const summary = await retry.onThrow(
      async () => generateEpisodeSummary(podcast, episode, transcript),
      { maxAttempts: 3, minTimeoutInMs: 5000, maxTimeoutInMs: 60000 }
    );

    logger.info("Summary generated", {
      worthItScore: summary.worthItScore,
      takeawaysCount: summary.keyTakeaways.length,
    });

    // Step 5: Persist to database
    metadata.set("step", "saving-results");
    logger.info("Persisting summary to database");

    // Check if this is a first-time summarization (no prior summary)
    // so we can skip the new_episode notification on re-summarizations.
    let isNewEpisode = true;
    try {
      const priorEpisode = await db.query.episodes.findFirst({
        where: eq(episodes.podcastIndexId, String(episodeId)),
        columns: { summary: true },
      });
      isNewEpisode = !priorEpisode?.summary;
    } catch (error) {
      logger.warn("Failed to check for prior summary, defaulting to new episode", {
        episodeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await retry.onThrow(
      async () => persistEpisodeSummary(episode, podcast, summary, transcript, dbTranscriptSource),
      { maxAttempts: 3 }
    );

    logger.info("Summary persisted successfully");

    // Create notifications for subscribers (episode row now exists in DB)
    try {
      const podcastDbId = await resolvePodcastId(episode.feedId);
      if (podcastDbId) {
        const dbEpisode = await db.query.episodes.findFirst({
          where: eq(episodes.podcastIndexId, String(episodeId)),
          columns: { id: true },
        });
        const episodeDbId = dbEpisode?.id ?? null;

        // new_episode notification — only on first summarization, not re-runs
        if (isNewEpisode) {
          await createNotificationsForSubscribers(
            podcastDbId,
            episodeDbId,
            "new_episode",
            podcast?.title ?? episode.title,
            `New episode: ${episode.title}`
          );
        }

        // summary_completed notification
        await createNotificationsForSubscribers(
          podcastDbId,
          episodeDbId,
          "summary_completed",
          podcast?.title ?? episode.title,
          `Summary ready: ${episode.title}`
        );
      }
    } catch (notifErr) {
      logger.warn("Failed to create notifications", {
        episodeId,
        error:
          notifErr instanceof Error ? notifErr.message : String(notifErr),
      });
    }

    metadata.set("step", "completed");
    metadata.root.increment("completed", 1);

    return summary;
  },
});
