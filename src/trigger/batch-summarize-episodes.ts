import { task, metadata, logger } from "@trigger.dev/sdk";
import { summarizeEpisode } from "./summarize-episode";

export type BatchSummarizePayload = {
  episodeIds: number[];
  skippedCount: number;
  totalRequested: number;
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
    const { episodeIds, skippedCount, totalRequested } = payload;

    logger.info("Starting batch summarization", {
      toProcess: episodeIds.length,
      skipped: skippedCount,
      totalRequested,
    });

    // If nothing to process, return early (all filtered by API route)
    if (episodeIds.length === 0) {
      metadata.set("progress", {
        total: totalRequested,
        succeeded: 0,
        failed: 0,
        skipped: skippedCount,
        completed: skippedCount,
      });

      logger.info("No episodes to process");

      return {
        succeeded: 0,
        failed: 0,
        skipped: skippedCount,
        results: [],
      };
    }

    // Set initial progress metadata
    metadata.set("progress", {
      total: totalRequested,
      succeeded: 0,
      failed: 0,
      skipped: skippedCount,
      completed: skippedCount,
    });

    // Fan out to individual summarize tasks
    logger.info("Triggering batch summarization", { count: episodeIds.length });

    const batchItems = episodeIds.map((episodeId) => ({
      payload: { episodeId },
      options: { idempotencyKey: `batch-summarize-${episodeId}` },
    }));

    const batchResult = await summarizeEpisode.batchTriggerAndWait(batchItems);

    // Process results
    const results: BatchSummarizeResult["results"] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < batchResult.runs.length; i++) {
      const result = batchResult.runs[i];
      const episodeId = episodeIds[i];

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

    // Update final metadata
    metadata.set("progress", {
      total: totalRequested,
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
