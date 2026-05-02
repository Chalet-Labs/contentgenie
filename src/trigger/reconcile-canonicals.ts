/**
 * Nightly canonical-topic reconciliation Trigger.dev scheduled task
 * (issue #389, ADR-050).
 *
 * Wires real dependencies into `runReconciliation` and emits the structured
 * `reconcile_summary` log (Phase 8). Per-merge transactional isolation,
 * per-cluster failure isolation, partial-accept verification, time-budget
 * guard, and overlap protection all live in the helper module — this file is
 * a thin orchestration shell.
 *
 * Schedule config (locked by VERIFY items in #389):
 *   - cron `0 3 * * *` UTC (runs before `generate-trending-topics` 06:00 and
 *     `rank-episode-topics` 07:00 — no collision)
 *   - `maxDuration: 600` (10 min ceiling; the helper's `RECONCILE_BUDGET_MS`
 *     of 540s leaves 60s headroom for Phase 6/7/8 to drain)
 *   - `retry.maxAttempts: 2`
 *   - `queue.concurrencyLimit: 1` — only one run at a time
 *   - `machine: 'medium-1x'` — 2 GB RAM for DBSCAN over 1024-dim vectors
 */

import { schedules, logger } from "@trigger.dev/sdk";

import { db } from "@/db";
import { generateCompletion } from "@/lib/ai/generate";
import { clusterByIdentityEmbedding } from "@/lib/reconcile-clustering";
import { mergeCanonicals } from "@/trigger/helpers/database";
import { runReconciliation } from "@/trigger/helpers/reconcile-canonicals";

export const reconcileCanonicals = schedules.task({
  id: "reconcile-canonicals",
  cron: "0 3 * * *",
  maxDuration: 600,
  retry: { maxAttempts: 2 },
  queue: { concurrencyLimit: 1 },
  machine: "medium-1x",
  run: async () => {
    const startMs = Date.now();
    logger.info("reconcile_start", { event: "reconcile_start" });
    try {
      const summary = await runReconciliation({
        db,
        mergeCanonicals,
        generateCompletion,
        clusterByIdentityEmbedding,
        logger,
        now: () => new Date(),
      });
      logger.info("reconcile_summary", {
        event: "reconcile_summary",
        ...summary,
      });
      return summary;
    } catch (err) {
      logger.error("reconcile_failed", {
        event: "reconcile_failed",
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startMs,
      });
      throw err;
    }
  },
});
