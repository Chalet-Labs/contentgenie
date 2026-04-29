import {
  task,
  retry,
  logger,
  metadata,
  AbortTaskRunError,
} from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { asPodcastIndexEpisodeId } from "@/types/ids";
import { getEpisodeById, getPodcastById } from "@/trigger/helpers/podcastindex";
import {
  generateEpisodeSummary,
  type SummaryResult,
} from "@/trigger/helpers/ai-summary";
import {
  trackEpisodeRun,
  persistEpisodeSummary,
  updateEpisodeStatus,
} from "@/trigger/helpers/database";
import {
  markSummaryReady,
  resolvePodcastId,
} from "@/trigger/helpers/notifications";
import { resolveAndPersistEpisodeTopics } from "@/trigger/helpers/resolve-topics";
import { getActiveAiConfig } from "@/lib/ai/config";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import type {
  PodcastIndexEpisode,
  PodcastIndexPodcast,
} from "@/lib/podcastindex";
import type { SummarizationStep } from "@/trigger/types";

function setStep(step: SummarizationStep) {
  metadata.set("step", step);
}

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
  maxDuration: 600, // 10 min — summarization itself is ~10-30s; generous buffer for retries
  onFailure: async (params: { payload: SummarizeEpisodePayload }) => {
    const { episodeId } = params.payload;
    // Trigger payload uses numeric form; brand for DB lookup.
    const piId = asPodcastIndexEpisodeId(String(episodeId));
    logger.error("Summarization task failed permanently", { episodeId });
    let existingProcessingError: string | null = null;
    try {
      const existing = await db.query.episodes.findFirst({
        where: eq(episodes.podcastIndexId, piId),
        columns: { processingError: true },
      });
      existingProcessingError = existing?.processingError ?? null;
    } catch (lookupError) {
      logger.warn("Failed to read existing processingError in onFailure", {
        episodeId,
        error:
          lookupError instanceof Error
            ? lookupError.message
            : String(lookupError),
      });
    }

    try {
      await db
        .update(episodes)
        .set({
          summaryStatus: "failed",
          summaryRunId: null,
          processingError:
            existingProcessingError ??
            "Summarization failed after maximum retry attempts",
          updatedAt: new Date(),
        })
        .where(eq(episodes.podcastIndexId, piId));
    } catch (error) {
      logger.error("Failed to update episode status to failed in database", {
        episodeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    metadata.root.increment("failed", 1);
  },
  run: async (
    payload: SummarizeEpisodePayload,
    { ctx },
  ): Promise<SummaryResult> => {
    const { episodeId } = payload;
    // Trigger payload uses numeric form; brand for DB lookup.
    const piId = asPodcastIndexEpisodeId(String(episodeId));

    // Step 1: Fetch episode from PodcastIndex
    setStep("fetching-episode");
    logger.info("Fetching episode from PodcastIndex", { episodeId });

    const episodeResponse = await retry.onThrow(
      async () => getEpisodeById(episodeId),
      { maxAttempts: 3 },
    );

    if (!episodeResponse?.episode) {
      const errorMsg = `Episode ${episodeId} not found in PodcastIndex`;
      try {
        await db
          .update(episodes)
          .set({
            summaryStatus: "failed",
            summaryRunId: null,
            processingError: errorMsg,
            updatedAt: new Date(),
          })
          .where(eq(episodes.podcastIndexId, piId));
      } catch (dbErr) {
        logger.warn("Failed to write processingError before abort", {
          episodeId,
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
      throw new AbortTaskRunError(errorMsg);
    }

    const episode: PodcastIndexEpisode = episodeResponse.episode;
    logger.info("Episode fetched", {
      title: episode.title,
      feedId: episode.feedId,
    });

    // Step 2: Fetch podcast context
    setStep("fetching-podcast");
    logger.info("Fetching podcast context", { feedId: episode.feedId });

    let podcast: PodcastIndexPodcast | undefined;
    try {
      const podcastResponse = await retry.onThrow(
        async () => getPodcastById(episode.feedId),
        { maxAttempts: 3 },
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

    // Step 3: Read transcript from database — fetch-transcript must have run first
    logger.info("Reading transcript from database", { episodeId });

    const episodeRow = await retry.onThrow(
      async () =>
        db.query.episodes.findFirst({
          where: eq(episodes.podcastIndexId, piId),
          columns: { transcription: true },
        }),
      { maxAttempts: 3 },
    );

    const transcript = episodeRow?.transcription?.trim() || null;

    if (!transcript) {
      const errorMsg = `Episode ${episodeId} has no transcript available — run fetch-transcript first`;
      try {
        await db
          .update(episodes)
          .set({
            summaryStatus: "failed",
            summaryRunId: null,
            processingError: errorMsg,
            updatedAt: new Date(),
          })
          .where(eq(episodes.podcastIndexId, piId));
      } catch (dbErr) {
        logger.warn("Failed to write processingError before abort", {
          episodeId,
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
      throw new AbortTaskRunError(errorMsg);
    }

    logger.info("Transcript read from database", { length: transcript.length });

    // Step 4: Generate AI summary
    setStep("generating-summary");
    logger.info("Generating AI summary");

    const aiConfig = await getActiveAiConfig();

    try {
      await updateEpisodeStatus(episodeId, "summarizing");
    } catch (error) {
      logger.warn("Failed to update episode status to summarizing", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const summary = await retry.onThrow(
      async () =>
        generateEpisodeSummary(
          podcast,
          episode,
          transcript,
          aiConfig.summarizationPrompt,
        ),
      { maxAttempts: 3, minTimeoutInMs: 5000, maxTimeoutInMs: 60000 },
    );

    logger.info("Summary generated", {
      worthItScore: summary.worthItScore,
      takeawaysCount: summary.keyTakeaways.length,
    });

    // Step 5: Persist to database
    setStep("saving-results");
    logger.info("Persisting summary to database");

    await retry.onThrow(
      async () => persistEpisodeSummary(episode, podcast, summary),
      { maxAttempts: 3 },
    );

    logger.info("Summary persisted successfully");

    // Update the existing notification row in place (created by the poller on discovery).
    // No-ops silently if no prior row exists (admin-triggered re-summarization).
    const dbEpisode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, piId),
      columns: { id: true },
    });
    const episodeDbId = dbEpisode?.id ?? null;

    try {
      const podcastDbId = await resolvePodcastId(episode.feedId);
      if (podcastDbId && episodeDbId != null) {
        await markSummaryReady(
          podcastDbId,
          episodeDbId,
          piId,
          podcast?.title ?? episode.title,
          `Summary ready: ${episode.title}`,
        );
      } else if (episodeDbId == null) {
        logger.warn("Could not resolve episode DB id for markSummaryReady", {
          episodeId,
        });
      }
    } catch (notifErr) {
      logger.warn("Failed to update notifications", {
        episodeId,
        error: notifErr instanceof Error ? notifErr.message : String(notifErr),
      });
    }

    setStep("resolving-topics");
    try {
      if (episodeDbId == null) {
        logger.warn(
          "[summarize-episode] skipping resolver: episode DB id unavailable",
          { episodeId },
        );
      } else {
        await resolveAndPersistEpisodeTopics(
          episodeDbId,
          summary.topics ?? [],
          summary.summary,
          { skipResolution: aiConfig.summarizationPrompt !== null },
        );
      }
    } catch (err) {
      logger.warn("[summarize-episode] canonical-topic resolution failed", {
        episodeId,
        err,
      });
    }

    setStep("completed");
    metadata.root.increment("completed", 1);

    return summary;
  },
});
