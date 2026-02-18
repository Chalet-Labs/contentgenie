import { task, metadata, logger } from "@trigger.dev/sdk";
import { and, isNotNull, lte, gte, eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { summarizeEpisode } from "./summarize-episode";

export type BulkResummarizePayload = {
  podcastId?: number;
  minDate?: string;
  maxDate?: string;
  maxScore?: number;
  all?: boolean;
};

export type BulkResummarizeProgress = {
  total: number;
  completed: number;
  failed: number;
  currentChunk: number;
  totalChunks: number;
};

export type BulkResummarizeResult = {
  total: number;
  succeeded: number;
  failed: number;
  failures: Array<{ episodeId: number; error: string }>;
};

const BATCH_CHUNK_SIZE = 500;

export const bulkResummarize = task({
  id: "bulk-resummarize",
  maxDuration: 3600,
  retry: {
    maxAttempts: 1,
  },
  queue: {
    name: "bulk-resummarize-queue",
    concurrencyLimit: 1,
  },
  run: async (payload: BulkResummarizePayload): Promise<BulkResummarizeResult> => {
    const { podcastId, minDate, maxDate, maxScore } = payload;

    logger.info("Starting bulk re-summarization", { podcastId, minDate, maxDate, maxScore });

    // Build WHERE conditions: processedAt IS NOT NULL (has existing summary) + optional filters
    const conditions = [isNotNull(episodes.processedAt)];

    if (podcastId !== undefined) {
      conditions.push(eq(episodes.podcastId, podcastId));
    }

    if (minDate) {
      conditions.push(gte(episodes.publishDate, new Date(minDate)));
    }

    if (maxDate) {
      conditions.push(lte(episodes.publishDate, new Date(maxDate)));
    }

    if (maxScore !== undefined) {
      conditions.push(lte(episodes.worthItScore, String(maxScore)));
    }

    // Query matching episodes
    const matchingEpisodes = await db
      .select({
        podcastIndexId: episodes.podcastIndexId,
      })
      .from(episodes)
      .where(and(...conditions));

    const episodeIds = matchingEpisodes.map((e) => Number(e.podcastIndexId));
    const total = episodeIds.length;
    const totalChunks = Math.ceil(total / BATCH_CHUNK_SIZE) || 1;

    logger.info("Found episodes to re-summarize", { total, totalChunks });

    // Initialize progress metadata
    metadata.set("progress", {
      total,
      completed: 0,
      failed: 0,
      currentChunk: 0,
      totalChunks,
    } satisfies BulkResummarizeProgress);

    // If no episodes match, return early
    if (total === 0) {
      return { total: 0, succeeded: 0, failed: 0, failures: [] };
    }

    // Process in chunks of up to 500 (SDK limit per batchTriggerAndWait call)
    const failures: BulkResummarizeResult["failures"] = [];
    let succeeded = 0;
    let failed = 0;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * BATCH_CHUNK_SIZE;
      const chunk = episodeIds.slice(start, start + BATCH_CHUNK_SIZE);

      logger.info("Processing chunk", {
        chunkIndex: chunkIndex + 1,
        totalChunks,
        chunkSize: chunk.length,
      });

      // NO idempotencyKey -- v3.3.0 bug can freeze the parent.
      // DB-level processedAt guard provides dedup.
      const batchItems = chunk.map((episodeId) => ({
        payload: { episodeId },
      }));

      const batchResult = await summarizeEpisode.batchTriggerAndWait(batchItems);

      // Aggregate per-child results
      for (let i = 0; i < batchResult.runs.length; i++) {
        const result = batchResult.runs[i];
        if (result.ok) {
          succeeded++;
        } else {
          failed++;
          const errorMessage =
            result.error instanceof Error
              ? result.error.message
              : String(result.error ?? "Unknown error");
          failures.push({ episodeId: chunk[i], error: errorMessage });
        }
      }

      // Update chunk progress in metadata (between chunks, parent is active)
      metadata.set("progress", {
        total,
        completed: succeeded,
        failed,
        currentChunk: chunkIndex + 1,
        totalChunks,
      } satisfies BulkResummarizeProgress);
    }

    logger.info("Bulk re-summarization complete", { total, succeeded, failed });

    return { total, succeeded, failed, failures };
  },
});
