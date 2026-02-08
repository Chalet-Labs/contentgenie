import { task, retry, logger, metadata, AbortTaskRunError } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { getEpisodeById, getPodcastById } from "./helpers/podcastindex";
import { fetchTranscript } from "./helpers/transcript";
import { generateEpisodeSummary, type SummaryResult } from "./helpers/openrouter";
import { trackEpisodeRun, persistEpisodeSummary } from "./helpers/database";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import type { PodcastIndexEpisode, PodcastIndexPodcast } from "@/lib/podcastindex";

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
  onFailure: async (params: { payload: SummarizeEpisodePayload }) => {
    const { episodeId } = params.payload;
    logger.error("Summarization task failed permanently", { episodeId });
    await db
      .update(episodes)
      .set({
        summaryStatus: "failed",
        summaryRunId: null,
        updatedAt: new Date(),
      })
      .where(eq(episodes.podcastIndexId, String(episodeId)));
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

    // Step 3: Fetch transcript (non-fatal)
    metadata.set("step", "fetching-transcript");
    logger.info("Fetching transcript");

    let transcript: string | undefined;
    try {
      transcript = await retry.onThrow(
        async () => fetchTranscript(episode),
        { maxAttempts: 2 }
      );
      if (transcript) {
        logger.info("Transcript fetched", { length: transcript.length });
      } else {
        logger.info("No transcript available for this episode");
      }
    } catch (error) {
      logger.warn("Transcript unavailable, proceeding without it", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 4: Generate AI summary via OpenRouter
    metadata.set("step", "generating-summary");
    logger.info("Generating AI summary via OpenRouter");

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

    await retry.onThrow(
      async () => persistEpisodeSummary(episode, podcast, summary, transcript),
      { maxAttempts: 3 }
    );

    logger.info("Summary persisted successfully");
    metadata.set("step", "completed");

    return summary;
  },
});
