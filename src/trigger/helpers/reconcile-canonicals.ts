/**
 * Pipeline orchestration for the nightly canonical-topic reconciliation
 * Trigger.dev task (issue #389). Implements Phases 1–7 via a thin
 * `runReconciliation` orchestrator + private phase helpers; the top-level
 * `schedules.task` (T5, `src/trigger/reconcile-canonicals.ts`) wires concrete
 * dependencies into `runReconciliation` and emits the structured
 * `reconcile_summary` log (Phase 8).
 *
 * Architectural anchors:
 *   - ADR-050 §2 — per-pair partial-accept on Phase 4 (NOT cluster-strict-reject).
 *   - ADR-050 §3 — per-merge transactions, per-cluster try/catch isolation.
 *   - ADR-050 §4 — `episodeCountDrift` is a true delta (post − pre), captured
 *     lazily at first merge to each winner. NOT a DB write.
 *   - ADR-050 §6 — `RECONCILE_BUDGET_MS` time-budget guard at the top of every
 *     cluster iteration so `reconcile_summary` always emits.
 *   - ADR-050 §7 — `mergedLoserIds: Set<number>` cross-cluster overlap guard.
 *
 * All IO flows through injected `deps`; SQL bodies live in
 * `./reconcile-canonicals-db.ts` and are reachable only through the injected
 * `db` (see helpers imported below). The top-level task supplies the real
 * implementations.
 */

import { sql } from "drizzle-orm";

import type { db as RealDb } from "@/db";
import type { mergeCanonicals as RealMergeCanonicals } from "@/trigger/helpers/database";
import type { generateCompletion as RealGenerateCompletion } from "@/lib/ai/generate";
import type {
  clusterByIdentityEmbedding as RealClusterByIdentityEmbedding,
  ClusterRow,
} from "@/lib/reconcile-clustering";
import { parseJsonResponse } from "@/lib/openrouter";
import {
  getReconcileWinnerPickPrompt,
  reconcileWinnerPickSchema,
  type ReconcileMember,
} from "@/lib/prompts/reconcile-winner-pick";
import {
  getReconcilePairwiseVerifyPrompt,
  reconcilePairwiseVerifySchema,
} from "@/lib/prompts/reconcile-pairwise-verify";
import {
  RECONCILE_BUDGET_MS,
  RECONCILE_DBSCAN_EPS,
  RECONCILE_DBSCAN_MIN_POINTS,
} from "@/lib/reconcile-constants";
import {
  countEpisodesForCanonical,
  decayStaleCanonicals,
  fetchActiveCanonicals,
} from "@/trigger/helpers/reconcile-canonicals-db";
import { ReconcileSummaryAccumulator } from "@/trigger/helpers/reconcile-summary-accumulator";

/** Minimal logger shape — compatible with `@trigger.dev/sdk`'s `logger` and a vi.fn() fake. */
export interface ReconcileLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Injectable dependencies for `runReconciliation`. All IO flows through here
 * so tests can supply fakes without a live DB or LLM. `now` is a clock
 * abstraction — tests freeze it to drive the budget-guard and decay-window
 * logic deterministically.
 */
export interface ReconcileDeps {
  db: typeof RealDb;
  mergeCanonicals: typeof RealMergeCanonicals;
  generateCompletion: typeof RealGenerateCompletion;
  clusterByIdentityEmbedding: typeof RealClusterByIdentityEmbedding;
  logger: ReconcileLogger;
  now: () => Date;
}

export interface ReconcileSummary {
  clustersSeen: number;
  clustersFailed: number;
  clustersDeferred: number;
  /** Rows dropped from Phase 1 because their `identity_embedding` contained NaN or non-finite values. */
  malformedEmbeddingCount: number;
  /**
   * Cluster-level: incremented when a winner_id returned by Phase 3 was
   * already merged as a loser in a prior cluster. DBSCAN with custom distance
   * fns can produce overlapping clusters; this guard prevents merging onto an
   * already-merged canonical (corruption + chain risk). ADR-050 §7.
   */
  clustersSkippedWinnerAlreadyMerged: number;
  mergesExecuted: number;
  mergesFailed: number;
  /**
   * Cluster-level: incremented at most once per cluster, and only when the
   * cluster ended with ≥1 rejected pair AND zero verified losers (the
   * cluster's grouping claim was rejected outright). ADR-050 §2.
   */
  mergesRejectedByPairwise: number;
  mergesSkippedAlreadyMerged: number;
  /** Per-pair count of verify-call throws (network/parse/Zod). Healthy = 0. */
  pairwiseVerifyThrew: number;
  /** Per-pair count of `same_entity=false` verdicts. Healthy R3 behavior. */
  pairwiseVerifyRejected: number;
  dormancyTransitions: number;
  /** Sum of `(postCount - preCount)` across affected winners. ADR-050 §4. */
  episodeCountDrift: number;
  durationMs: number;
}

/**
 * Phase-1 row after the orchestrator drops malformed embeddings; the non-null
 * `embedding` invariant is enforced at the call site that narrows from
 * `RawCanonicalRow`.
 */
interface CanonicalRow {
  id: number;
  label: string;
  kind: ReconcileMember["kind"];
  summary: string;
  embedding: number[];
}

// ─── Phase helpers ────────────────────────────────────────────────────────────

type PickWinnerResult = { kind: "ok"; winnerId: number } | { kind: "skip" };

/** Phase 3 — call the LLM to select a winner from pre-built members. Pure of counter side-effects. */
async function pickWinner(
  deps: Pick<ReconcileDeps, "generateCompletion">,
  cluster: number[],
  members: ReconcileMember[],
): Promise<PickWinnerResult> {
  const raw = await deps.generateCompletion([
    { role: "user", content: getReconcileWinnerPickPrompt(members) },
  ]);
  const parsed = reconcileWinnerPickSchema.parse(parseJsonResponse(raw));
  const { winner_id: winnerId } = parsed;

  if (winnerId === null || !cluster.includes(winnerId)) {
    return { kind: "skip" };
  }
  return { kind: "ok", winnerId };
}

interface VerifyLosersResult {
  verifiedLoserIds: readonly number[];
  pairwiseVerifyThrew: number;
  pairwiseVerifyRejected: number;
}

/** Phase 4 — per-pair partial-accept verify (ADR-050 §2). Returns counts for the orchestrator to route. */
async function verifyLosers(
  deps: Pick<ReconcileDeps, "generateCompletion" | "logger">,
  winner: CanonicalRow,
  loserIds: number[],
  rowsById: Map<number, CanonicalRow>,
): Promise<VerifyLosersResult> {
  const verifiedLoserIds: number[] = [];
  let pairwiseVerifyThrew = 0;
  let pairwiseVerifyRejected = 0;

  for (const loserId of loserIds) {
    const loser = rowsById.get(loserId);
    if (!loser) {
      // Defensive: cluster id has no fetched row (invariant violation).
      // Count on the throws side — it's an infra signal, not a model verdict.
      pairwiseVerifyThrew++;
      deps.logger.warn("reconcile_pairwise_verify_loser_row_missing", {
        winnerId: winner.id,
        loserId,
      });
      continue;
    }
    try {
      const verifyRaw = await deps.generateCompletion([
        {
          role: "user",
          content: getReconcilePairwiseVerifyPrompt(winner, loser),
        },
      ]);
      const verifyParsed = reconcilePairwiseVerifySchema.parse(
        parseJsonResponse(verifyRaw),
      );
      if (verifyParsed.same_entity) {
        verifiedLoserIds.push(loserId);
      } else {
        pairwiseVerifyRejected++;
      }
    } catch (err) {
      // Treat failure as "no" (ADR-050 §3) — preserves R3 over-merge guard.
      pairwiseVerifyThrew++;
      deps.logger.warn("reconcile_pairwise_verify_failed", {
        winnerId: winner.id,
        loserId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { verifiedLoserIds, pairwiseVerifyThrew, pairwiseVerifyRejected };
}

/** Mutable cross-cluster state owned by the orchestrator and threaded through per-cluster helpers. */
interface ClusterState {
  mergedLoserIds: Set<number>;
  preMergeCounts: Map<number, number>;
  affectedWinners: Set<number>;
}

/** Phase 5 — merge each verified loser. Mutates the shared cross-cluster state + accumulator. */
async function mergeVerifiedLosers(
  deps: Pick<ReconcileDeps, "db" | "mergeCanonicals" | "logger">,
  winnerId: number,
  verifiedLoserIds: readonly number[],
  state: ClusterState,
  accum: ReconcileSummaryAccumulator,
): Promise<void> {
  const { mergedLoserIds, preMergeCounts, affectedWinners } = state;

  for (const loserId of verifiedLoserIds) {
    if (mergedLoserIds.has(loserId)) {
      // Cross-cluster overlap guard (ADR-050 §7).
      accum.mergeSkippedAlreadyMerged();
      continue;
    }
    if (!preMergeCounts.has(winnerId)) {
      preMergeCounts.set(
        winnerId,
        await countEpisodesForCanonical(deps.db, winnerId),
      );
    }
    try {
      await deps.mergeCanonicals({
        loserId,
        winnerId,
        actor: "reconcile-canonicals",
      });
      mergedLoserIds.add(loserId);
      affectedWinners.add(winnerId);
      accum.mergeSucceeded();
    } catch (err) {
      accum.mergeFailed();
      deps.logger.warn("reconcile_merge_failed", {
        winnerId,
        loserId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/** Phase 6 — compute true episode-count delta (post − pre) across affected winners. */
async function computeEpisodeDrift(
  database: ReconcileDeps["db"],
  affectedWinners: Set<number>,
  preMergeCounts: Map<number, number>,
): Promise<number> {
  const winnerIds = Array.from(affectedWinners);
  if (winnerIds.length === 0) return 0;

  // Single batch query instead of N per-winner queries (N+1 pattern).
  const result = await database.execute<{ id: number; count: number | string }>(
    sql`SELECT canonical_topic_id AS id, count(*)::int AS count
        FROM episode_canonical_topics
        WHERE canonical_topic_id = ANY(ARRAY[${sql.join(
          winnerIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::int[])
        GROUP BY canonical_topic_id`,
  );

  const postCounts = new Map(
    result.rows.map((r) => [
      r.id,
      typeof r.count === "number" ? r.count : Number(r.count),
    ]),
  );

  let delta = 0;
  for (const winnerId of winnerIds) {
    const post = postCounts.get(winnerId) ?? 0;
    const pre = preMergeCounts.get(winnerId) ?? 0;
    delta += post - pre;
  }
  return delta;
}

/** Build the `ReconcileMember[]` list for a cluster, filtering ids with no fetched row. */
function membersOf(
  cluster: number[],
  rowsById: Map<number, CanonicalRow>,
): ReconcileMember[] {
  return cluster
    .map((id) => rowsById.get(id))
    .filter((r): r is CanonicalRow => r !== undefined)
    .map((r) => ({
      id: r.id,
      label: r.label,
      kind: r.kind,
      summary: r.summary,
    }));
}

/**
 * Execute phases 3–5 for a single cluster. Contains the per-cluster try/catch
 * so a winner-pick or verify throw never aborts the entire pipeline.
 * `clusterSeen()` is called by the orchestrator before this function.
 */
async function runCluster(
  deps: ReconcileDeps,
  cluster: number[],
  clusterIndex: number,
  rowsById: Map<number, CanonicalRow>,
  state: ClusterState,
  accum: ReconcileSummaryAccumulator,
): Promise<void> {
  let currentPhase: "winner_pick" | "pairwise_verify" | "merge" = "winner_pick";
  let clusterWinnerId: number | null = null;

  try {
    const members = membersOf(cluster, rowsById);
    if (members.length < 2) return;

    const pick = await pickWinner(deps, cluster, members);
    if (pick.kind === "skip") return;
    const { winnerId } = pick;

    if (state.mergedLoserIds.has(winnerId)) {
      accum.clusterSkippedWinnerAlreadyMerged();
      return;
    }
    clusterWinnerId = winnerId;
    const winner = rowsById.get(winnerId);
    if (!winner) {
      // Invariant: pickWinner returned an id absent from rowsById — treat as failure.
      accum.clusterFailed();
      deps.logger.warn("reconcile_cluster_winner_row_missing", {
        clusterIndex,
        winnerId,
        memberIds: cluster,
      });
      return;
    }

    currentPhase = "pairwise_verify";
    const losers = cluster.filter((id) => id !== winnerId);
    const verify = await verifyLosers(deps, winner, losers, rowsById);
    accum.pairwiseVerifyThrew(verify.pairwiseVerifyThrew);
    accum.pairwiseVerifyRejected(verify.pairwiseVerifyRejected);
    if (
      verify.pairwiseVerifyRejected > 0 &&
      verify.verifiedLoserIds.length === 0
    ) {
      accum.clusterRejectedByPairwise();
    }

    currentPhase = "merge";
    await mergeVerifiedLosers(
      deps,
      winnerId,
      verify.verifiedLoserIds,
      state,
      accum,
    );
  } catch (err) {
    accum.clusterFailed();
    deps.logger.warn("reconcile_cluster_failed", {
      clusterIndex,
      phase: currentPhase,
      memberIds: cluster,
      winnerId: clusterWinnerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run the full reconciliation pipeline (Phases 1–7). The top-level Trigger.dev
 * task (T5) wraps this with structured `reconcile_start` + `reconcile_summary`
 * logs and rethrows on terminal failure.
 */
export async function runReconciliation(
  deps: ReconcileDeps,
): Promise<ReconcileSummary> {
  const { db, logger, now } = deps;
  const startMs = now().getTime();
  const accum = new ReconcileSummaryAccumulator();

  // Phase 1 — fetch + filter malformed embeddings
  const rawRows = await fetchActiveCanonicals(db);
  const rows: CanonicalRow[] = [];
  for (const r of rawRows) {
    if (r.embedding === null) accum.malformedEmbeddingDropped();
    else rows.push(r as CanonicalRow);
  }

  if (rows.length === 0) {
    logger.info("reconcile_phase1_empty", { rowCount: 0 });
    const dormancyTransitions = await decayStaleCanonicals(db);
    logger.info("reconcile_phase7_decay", {
      event: "reconcile_phase7_decay",
      dormancyTransitions,
      phase1Empty: true,
    });
    accum.dormancyTransitioned(dormancyTransitions);
    return accum.freeze(now().getTime() - startMs);
  }

  // Phase 2 — cluster
  const { clusters } = deps.clusterByIdentityEmbedding(
    rows.map((r): ClusterRow => ({ id: r.id, embedding: r.embedding })),
    { eps: RECONCILE_DBSCAN_EPS, minPoints: RECONCILE_DBSCAN_MIN_POINTS },
  );
  const rowsById = new Map<number, CanonicalRow>();
  for (const r of rows) rowsById.set(r.id, r);

  // Cross-cluster state owned by the orchestrator (ADR-050 §7).
  // Merge chains in the database (A→B→C) are walked at read time by
  // walkMergedChain() in src/app/(app)/topic/[id]/merge-walker.ts, so the
  // orchestrator does not flatten them — `mergeCanonicals` rejects already-
  // merged rows (`not-active`), which makes a redirect rewrite from this layer
  // structurally impossible without a separate DB helper.
  const mergedLoserIds = new Set<number>();
  const preMergeCounts = new Map<number, number>();
  const affectedWinners = new Set<number>();

  // Phases 3–5 — per-cluster orchestration
  const state: ClusterState = {
    mergedLoserIds,
    preMergeCounts,
    affectedWinners,
  };
  for (let i = 0; i < clusters.length; i++) {
    // Phase 6 budget guard (ADR-050 §6) — top of every cluster iteration.
    if (now().getTime() - startMs > RECONCILE_BUDGET_MS) {
      const remaining = clusters.length - i;
      accum.clusterDeferred(remaining);
      logger.warn("reconcile_budget_exhausted", {
        processed: i,
        deferred: remaining,
      });
      break;
    }

    accum.clusterSeen();
    await runCluster(deps, clusters[i], i, rowsById, state, accum);
  }

  // Phase 6 — episode-count drift (ADR-050 §4)
  accum.episodeCountDriftAdded(
    await computeEpisodeDrift(db, affectedWinners, preMergeCounts),
  );

  // Phase 7 — decay stale event-type canonicals
  const dormancyTransitions = await decayStaleCanonicals(db);
  logger.info("reconcile_phase7_decay", {
    event: "reconcile_phase7_decay",
    dormancyTransitions,
    phase1Empty: false,
  });
  accum.dormancyTransitioned(dormancyTransitions);

  return accum.freeze(now().getTime() - startMs);
}
