import { task, retry, logger, metadata, wait } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { fetchTranscript, extractTranscriptUrl, fetchTranscriptFromUrl } from "@/trigger/helpers/transcript";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import { submitTranscriptionAsync, getTranscriptionStatus } from "@/lib/assemblyai";
import { updateEpisodeStatus, persistTranscript } from "@/trigger/helpers/database";

export type FetchTranscriptPayload = {
  episodeId: number;
  enclosureUrl?: string;
  description?: string;
  transcripts?: Array<{ url: string; type: string }>;
  force?: boolean;
};

export type FetchTranscriptResult = {
  transcript: string | undefined;
  source: "podcastindex" | "assemblyai" | "description-url" | null | undefined;
};

export const fetchTranscriptTask = task({
  id: "fetch-transcript",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "fetch-transcript-queue" }, // dedicated queue — never share summarize-queue (deadlock risk)
  maxDuration: 7200,
  run: async (payload: FetchTranscriptPayload): Promise<FetchTranscriptResult> => {
    const { episodeId, enclosureUrl, description, transcripts, force = false } = payload;

    metadata.set("step", "fetching-transcript");
    logger.info("Checking for cached transcription");

    let transcript: string | undefined;
    let transcriptSource: "cached" | "podcastindex" | "description-url" | "assemblyai" | "none" = "none";

    // Step 1: Check cached transcription in database (cheapest source), unless force=true
    if (!force) {
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
    }

    // Step 2: Fetch transcript from PodcastIndex (non-fatal)
    if (!transcript) {
      logger.info("Fetching transcript from PodcastIndex");
      try {
        transcript = await retry.onThrow(
          async () => fetchTranscript({ transcripts: transcripts ?? [] } as PodcastIndexEpisode),
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

    // Step 3: Extract transcript URL from description
    if (!transcript && description) {
      const transcriptUrl = extractTranscriptUrl(description);
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

    // Step 4: AssemblyAI async transcription via Trigger.dev token
    if (!transcript && enclosureUrl) {
      metadata.set("step", "transcribing-audio");

      try {
        await updateEpisodeStatus(episodeId, "transcribing");
      } catch (error) {
        logger.warn("Failed to update episode status to transcribing", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        const token = await wait.createToken({ timeout: "1h30m" });
        const transcriptId = await submitTranscriptionAsync(enclosureUrl, token.url);
        logger.info("Submitted audio for async transcription", { transcriptId });

        const result = await wait.forToken<{
          transcript_id: string;
          status: "completed" | "error";
        }>(token);

        if (result.ok && result.output.status === "completed") {
          // The webhook only contains { transcript_id, status } — fetch the
          // full transcript text via a follow-up GET request.
          const fullResult = await retry.onThrow(async () => {
            const statusResult = await getTranscriptionStatus(result.output.transcript_id);
            if (statusResult.status === "error") {
              return statusResult;
            }
            if (!statusResult.text?.trim()) {
              throw new Error("AssemblyAI transcript text not available yet");
            }
            return statusResult;
          }, { maxAttempts: 3, minTimeoutInMs: 1_000 });
          if (fullResult.status === "error") {
            logger.warn("AssemblyAI transcript status check returned error", {
              transcriptId: result.output.transcript_id,
              error: fullResult.error,
            });
          } else if (fullResult.text) {
            transcript = fullResult.text;
            transcriptSource = "assemblyai";
            logger.info("Audio transcribed successfully", { length: transcript.length });
          } else {
            logger.warn("AssemblyAI transcript completed but returned no text", {
              transcriptId: result.output.transcript_id,
              status: fullResult.status,
              error: fullResult.error,
            });
          }
        } else if (result.ok) {
          try {
            const fullResult = await getTranscriptionStatus(result.output.transcript_id);
            logger.warn("AssemblyAI transcription failed", {
              transcriptId: result.output.transcript_id,
              status: fullResult.status,
              error: fullResult.error,
            });
          } catch (statusError) {
            logger.warn("AssemblyAI transcription failed", {
              transcriptId: result.output.transcript_id,
              status: result.output.status,
              statusFetchError: statusError instanceof Error ? statusError.message : String(statusError),
            });
          }
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

    // Map internal sentinels to DB-safe values:
    // "cached" → undefined (preserve existing DB value), "none" → null
    const dbSource: FetchTranscriptResult["source"] =
      transcriptSource === "cached"
        ? undefined
        : transcriptSource === "none"
          ? null
          : transcriptSource;

    logger.info("Transcript acquisition complete", {
      source: transcriptSource,
      hasTranscript: !!transcript,
      length: transcript?.length,
    });

    // Persist transcript before returning for retry idempotency.
    // Only persist when we fetched from an external source (not cache — DB is already correct).
    // persistEpisodeSummary in summarize-episode will overwrite these columns again; that write is authoritative.
    if (transcript && dbSource !== undefined && dbSource !== null) {
      try {
        await persistTranscript(episodeId, transcript, dbSource);
      } catch (error) {
        logger.warn("Failed to persist transcript (non-fatal), continuing", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { transcript, source: dbSource };
  },
});
