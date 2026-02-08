import { task, metadata, logger } from "@trigger.dev/sdk";
import { inArray } from "drizzle-orm";
import { summarizeEpisode } from "./summarize-episode";
import { db } from "@/db";
import { episodes } from "@/db/schema";

export type BatchSummarizePayload = {
  episodeIds: number[];
};

export type BatchSummarizeResult = {
  succeeded: number;
  failed: number;
  skipped: number;
  results: Array<{
    episodeId: number;
    status: "succeeded" | "failed" | "skipped";
    error?: string;
  }>;
};

export const batchSummarizeEpisodes = task({
  id: "batch-summarize-episodes",
  run: async (payload: BatchSummarizePayload): Promise<BatchSummarizeResult> => {
    const { episodeIds } = payload;
    const total = episodeIds.length;

    logger.info("Starting batch summarization", { total });

    // Step 1: Query DB for already-processed episodes
    const existingEpisodes = await db.query.episodes.findMany({
      where: inArray(
        episodes.podcastIndexId,
        episodeIds.map(String)
      ),
      columns: { podcastIndexId: true, processedAt: true },
    });

    const processedIds = new Set(
      existingEpisodes
        .filter((e) => e.processedAt !== null)
        .map((e) => Number(e.podcastIndexId))
    );

    // Step 2: Compute uncached episode IDs
    const skippedIds = episodeIds.filter((id) => processedIds.has(id));
    const uncachedIds = episodeIds.filter((id) => !processedIds.has(id));
    const skippedCount = skippedIds.length;

    logger.info("Pre-filter complete", {
      total,
      skipped: skippedCount,
      toProcess: uncachedIds.length,
    });

    // Build initial results for skipped episodes
    const results: BatchSummarizeResult["results"] = skippedIds.map((id) => ({
      episodeId: id,
      status: "skipped" as const,
    }));

    // Step 3: If all skipped, return early
    if (uncachedIds.length === 0) {
      metadata.set("progress", {
        total,
        succeeded: 0,
        failed: 0,
        skipped: total,
        completed: total,
      });

      logger.info("All episodes already cached, skipping batch");

      return {
        succeeded: 0,
        failed: 0,
        skipped: total,
        results,
      };
    }

    // Step 4: Set initial progress metadata
    metadata.set("progress", {
      total,
      succeeded: 0,
      failed: 0,
      skipped: skippedCount,
      completed: skippedCount,
    });

    // Step 5: Fan out to individual summarize tasks
    logger.info("Triggering batch summarization", { count: uncachedIds.length });

    const batchItems = uncachedIds.map((episodeId) => ({
      payload: { episodeId },
      options: { idempotencyKey: `batch-summarize-${episodeId}` },
    }));

    const batchResult = await summarizeEpisode.batchTriggerAndWait(batchItems);

    // Step 6: Process results
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < batchResult.runs.length; i++) {
      const result = batchResult.runs[i];
      const episodeId = uncachedIds[i];

      if (result.ok) {
        succeeded++;
        results.push({ episodeId, status: "succeeded" });
      } else {
        failed++;
        const errorMessage =
          result.error instanceof Error
            ? result.error.message
            : String(result.error ?? "Unknown error");
        results.push({ episodeId, status: "failed", error: errorMessage });
      }
    }

    // Step 7: Update final metadata
    metadata.set("progress", {
      total,
      succeeded,
      failed,
      skipped: skippedCount,
      completed: succeeded + failed + skippedCount,
    });

    logger.info("Batch summarization complete", {
      succeeded,
      failed,
      skipped: skippedCount,
    });

    return {
      succeeded,
      failed,
      skipped: skippedCount,
      results,
    };
  },
});
