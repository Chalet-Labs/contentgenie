import { task, retry, logger, metadata, AbortTaskRunError, wait } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { getEpisodeById, getPodcastById } from "@/trigger/helpers/podcastindex";
import { fetchTranscript, extractTranscriptUrl, fetchTranscriptFromUrl } from "@/trigger/helpers/transcript";
import { generateEpisodeSummary, type SummaryResult } from "@/trigger/helpers/ai-summary";
import { trackEpisodeRun, persistEpisodeSummary, updateEpisodeStatus } from "@/trigger/helpers/database";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import type { PodcastIndexEpisode, PodcastIndexPodcast } from "@/lib/podcastindex";
import { submitTranscriptionAsync } from "@/lib/assemblyai";

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
  maxDuration: 7200, // 2 hours — allows async AssemblyAI webhook wait
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

    // Step 3: Check cached transcription in database (cheapest source)
    metadata.set("step", "fetching-transcript");
    logger.info("Checking for cached transcription");

    let transcript: string | undefined;
    let transcriptSource: "cached" | "podcastindex" | "description-url" | "assemblyai" | "none" = "none";
    try {
      const existing = await db.query.episodes.findFirst({
        where: eq(episodes.podcastIndexId, String(episodeId)),
        columns: { transcription: true },
      });
      if (existing?.transcription?.trim()) {
        transcript = existing.transcription;
        transcriptSource = "cached";
        logger.info("Using cached transcription", { length: transcript.length });
      }
    } catch (error) {
      logger.warn("Failed to check cached transcription, continuing without it", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 3a: Fetch transcript from PodcastIndex (non-fatal)
    if (!transcript) {
      logger.info("Fetching transcript from PodcastIndex");
      try {
        transcript = await retry.onThrow(
          async () => fetchTranscript(episode),
          { maxAttempts: 2 }
        );
        if (transcript) {
          transcriptSource = "podcastindex";
          logger.info("Transcript fetched", { length: transcript.length });
        } else {
          logger.info("No transcript available from PodcastIndex");
        }
      } catch (error) {
        logger.warn("Transcript unavailable, proceeding without it", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Step 3b: Extract transcript URL from description
    if (!transcript && episode.description) {
      const transcriptUrl = extractTranscriptUrl(episode.description);
      if (transcriptUrl) {
        logger.info("Found transcript URL in description", { url: transcriptUrl });
        try {
          transcript = await fetchTranscriptFromUrl(transcriptUrl);
          if (transcript) {
            transcriptSource = "description-url";
            logger.info("Transcript fetched from description URL", { length: transcript.length });
          } else {
            logger.info("Description transcript URL returned no content");
          }
        } catch (error) {
          logger.warn("Description transcript URL fetch failed", {
            url: transcriptUrl,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Step 3c: AssemblyAI async transcription via Trigger.dev token
    if (!transcript && episode.enclosureUrl) {
      metadata.set("step", "transcribing-audio");

      try {
        await updateEpisodeStatus(episodeId, "transcribing");
      } catch (error) {
        logger.warn("Failed to update episode status to transcribing", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        const token = await wait.createToken({ timeout: "2h" });
        const transcriptId = await submitTranscriptionAsync(episode.enclosureUrl, token.url);
        logger.info("Submitted audio for async transcription", { transcriptId });

        const result = await wait.forToken<{
          transcript_id: string;
          status: "completed" | "error";
          text: string | null;
          error: string | null;
        }>(token);

        if (result.ok && result.output.status === "completed") {
          if (result.output.text) {
            transcript = result.output.text;
            transcriptSource = "assemblyai";
            logger.info("Audio transcribed successfully", { length: transcript.length });
          } else {
            logger.warn("AssemblyAI transcript completed but returned no text", {
              status: result.output.status,
              error: result.output.error,
            });
          }
        } else if (result.ok) {
          logger.warn("AssemblyAI transcription failed", {
            status: result.output.status,
            error: result.output.error,
          });
        } else {
          logger.warn("AssemblyAI transcription wait timed out");
        }
      } catch (error) {
        logger.warn("AssemblyAI transcription unavailable, proceeding without it", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Defensive: normalize whitespace-only transcripts
    if (transcript && !transcript.trim()) {
      logger.warn("Transcript was whitespace-only, treating as unavailable", { source: transcriptSource });
      transcript = undefined;
      transcriptSource = "none";
    }

    logger.info("Transcript acquisition complete", {
      source: transcriptSource,
      hasTranscript: !!transcript,
      length: transcript?.length,
    });

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

    await retry.onThrow(
      async () => persistEpisodeSummary(episode, podcast, summary, transcript),
      { maxAttempts: 3 }
    );

    logger.info("Summary persisted successfully");
    metadata.set("step", "completed");
    metadata.root.increment("completed", 1);

    return summary;
  },
});
