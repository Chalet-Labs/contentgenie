/**
 * Pipeline orchestration for the nightly canonical-topic reconciliation
 * Trigger.dev task (issue #389). Implements Phases 1–7 inline; the top-level
 * `schedules.task` (T5, `src/trigger/reconcile-canonicals.ts`) wires concrete
 * dependencies into `runReconciliation` and emits the structured
 * `reconcile_summary` log (Phase 8).
 *
 * Architectural anchors:
 *   - ADR-048 §2 — per-pair partial-accept on Phase 4 (NOT cluster-strict-reject).
 *   - ADR-048 §3 — per-merge transactions, per-cluster try/catch isolation.
 *   - ADR-048 §4 — `episodeCountDrift` is a true delta (post − pre), captured
 *     lazily at first merge to each winner. NOT a DB write.
 *   - ADR-048 §6 — `RECONCILE_BUDGET_MS` time-budget guard at the top of every
 *     cluster iteration so `reconcile_summary` always emits.
 *   - ADR-048 §7 — `mergedLoserIds: Set<number>` cross-cluster overlap guard.
 *
 * Pure-ish module: all IO (DB, LLM, merge) flows through injected dependencies
 * for testability. The top-level task supplies the real implementations.
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
  RECONCILE_DECAY_DAYS,
  RECONCILE_DECAY_KINDS,
  RECONCILE_LOOKBACK_DAYS,
} from "@/lib/reconcile-constants";

/** Minimal logger shape — compatible with `@trigger.dev/sdk`'s `logger` and a vi.fn() fake. */
export interface ReconcileLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

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
   * already-merged canonical (corruption + chain risk). ADR-048 §7.
   */
  clustersSkippedWinnerAlreadyMerged: number;
  mergesExecuted: number;
  mergesFailed: number;
  /**
   * Cluster-level: incremented at most once per cluster, and only when the
   * cluster ended with ≥1 rejected pair AND zero verified losers (the
   * cluster's grouping claim was rejected outright). ADR-048 §2.
   */
  mergesRejectedByPairwise: number;
  mergesSkippedAlreadyMerged: number;
  /** Per-pair count of verify-call throws (network/parse/Zod). Healthy = 0. */
  pairwiseVerifyThrew: number;
  /** Per-pair count of `same_entity=false` verdicts. Healthy R3 behavior. */
  pairwiseVerifyRejected: number;
  dormancyTransitions: number;
  /** Sum of `(postCount - preCount)` across affected winners. ADR-048 §4. */
  episodeCountDrift: number;
  durationMs: number;
}

/**
 * Internal: row shape returned by Phase 1's SELECT. `embedding` is the
 * `identity_embedding` column flattened to a `number[]` for clustering.
 */
interface CanonicalRow {
  id: number;
  label: string;
  kind: ReconcileMember["kind"];
  summary: string;
  embedding: number[];
}

/**
 * Raw row as returned by the Phase 1 SELECT before embedding coercion.
 * `embedding` is `null` when `coerceEmbedding` detected a malformed vector.
 */
interface RawCanonicalRow {
  id: number;
  label: string;
  kind: ReconcileMember["kind"];
  summary: string;
  embedding: number[] | null;
}

const EMPTY_SUMMARY = (durationMs: number): ReconcileSummary => ({
  clustersSeen: 0,
  clustersFailed: 0,
  clustersDeferred: 0,
  malformedEmbeddingCount: 0,
  clustersSkippedWinnerAlreadyMerged: 0,
  mergesExecuted: 0,
  mergesFailed: 0,
  mergesRejectedByPairwise: 0,
  mergesSkippedAlreadyMerged: 0,
  pairwiseVerifyThrew: 0,
  pairwiseVerifyRejected: 0,
  dormancyTransitions: 0,
  episodeCountDrift: 0,
  durationMs,
});

/**
 * Best-effort coerce of the `identity_embedding` column the DB driver returns.
 * Postgres `vector` may surface as `number[]` (pg JSON path), `string`
 * (`"[1,2,3]"`), or `Float32Array`. The clustering helper expects `number[]`.
 *
 * Returns `null` when any element is NaN or non-finite (malformed input that
 * would silently corrupt DBSCAN distances). Returns `[]` only for empty
 * vectors from recognised shapes; `null` for entirely unrecognised shapes.
 */
function coerceEmbedding(raw: unknown): number[] | null {
  let arr: number[];
  if (Array.isArray(raw)) {
    arr = raw.map((v) => Number(v));
  } else if (raw instanceof Float32Array) {
    arr = Array.from(raw);
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (
      trimmed.length >= 2 &&
      trimmed.startsWith("[") &&
      trimmed.endsWith("]")
    ) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner.length === 0) return [];
      arr = inner.split(",").map((s) => Number(s.trim()));
    } else {
      return null;
    }
  } else {
    return null;
  }
  // Guard: any NaN or ±Infinity element taints the whole vector.
  if (arr.some((x) => !Number.isFinite(x))) return null;
  return arr;
}

/**
 * Phase 1 — fetch active canonicals seen in the last `RECONCILE_LOOKBACK_DAYS`
 * with their identity embeddings.
 *
 * Returns `RawCanonicalRow[]` where `embedding` is `null` for rows whose
 * `identity_embedding` failed the finite-value guard in `coerceEmbedding`.
 * Callers are responsible for filtering and incrementing `malformedEmbeddingCount`.
 */
async function fetchActiveCanonicals(
  database: ReconcileDeps["db"],
): Promise<RawCanonicalRow[]> {
  const result = await database.execute<{
    id: number;
    label: string;
    kind: ReconcileMember["kind"];
    summary: string;
    identity_embedding: unknown;
  }>(
    sql`SELECT id, label, kind, summary, identity_embedding
        FROM canonical_topics
        WHERE status = 'active'
          AND last_seen > now() - (${RECONCILE_LOOKBACK_DAYS}::int * INTERVAL '1 day')`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    kind: row.kind,
    summary: row.summary,
    embedding: coerceEmbedding(row.identity_embedding),
  }));
}

/**
 * Phase 6 helper — count of episodes referencing a canonical topic via the
 * junction table. The same source of truth as the read-side `episode_count`
 * everywhere else in the app (PR #424 / ADR-048 §4).
 */
async function countEpisodesForCanonical(
  database: ReconcileDeps["db"],
  canonicalId: number,
): Promise<number> {
  const result = await database.execute<{ count: number | string }>(
    sql`SELECT count(*)::int AS count
        FROM episode_canonical_topics
        WHERE canonical_topic_id = ${canonicalId}`,
  );
  const raw = result.rows[0]?.count ?? 0;
  return typeof raw === "number" ? raw : Number(raw);
}

/**
 * Phase 7 — flip event-type canonicals to dormant when `last_seen` is older
 * than `RECONCILE_DECAY_DAYS`. Topic-type kinds (`concept`, `work`) are
 * excluded by the kind filter; `ongoing=true` is exempt by predicate.
 */
async function decayStaleCanonicals(
  database: ReconcileDeps["db"],
): Promise<number> {
  // Drizzle does not serialize a JS array as a Postgres array when passed as a
  // bound param — `${kinds}::canonical_topic_kind[]` produces
  // `($1, $2, ...)::canonical_topic_kind[]` (a record cast), which Postgres
  // rejects at runtime. Build the array literal explicitly with `sql.join`,
  // mirroring the pattern at `src/trigger/helpers/database.ts:611`.
  const kinds = RECONCILE_DECAY_KINDS;
  const result = await database.execute<{ id: number }>(
    sql`UPDATE canonical_topics
        SET status = 'dormant'
        WHERE status = 'active'
          AND ongoing = false
          AND kind = ANY(ARRAY[${sql.join(
            kinds.map((k) => sql`${k}`),
            sql`, `,
          )}]::canonical_topic_kind[])
          AND last_seen < now() - (${RECONCILE_DECAY_DAYS}::int * INTERVAL '1 day')
        RETURNING id`,
  );
  return result.rows.length;
}

/**
 * Run the full reconciliation pipeline (Phases 1–7). The top-level Trigger.dev
 * task (T5) wraps this with structured `reconcile_start` + `reconcile_summary`
 * logs and rethrows on terminal failure.
 */
export async function runReconciliation(
  deps: ReconcileDeps,
): Promise<ReconcileSummary> {
  const { db, mergeCanonicals, generateCompletion, logger, now } = deps;
  const startMs = now().getTime();

  // ───────── Phase 1 — fetch active canonicals ─────────
  const rawRows = await fetchActiveCanonicals(db);

  // Drop rows whose identity_embedding produced NaN/non-finite values.
  let malformedEmbeddingCount = 0;
  const rows: CanonicalRow[] = [];
  for (const r of rawRows) {
    if (r.embedding === null) {
      malformedEmbeddingCount++;
    } else {
      rows.push(r as CanonicalRow);
    }
  }

  if (rows.length === 0) {
    logger.info("reconcile_phase1_empty", { rowCount: 0 });
    // Skip Phases 2–6 (no clusters → no merges), but Phase 7 (decay) is
    // logically independent: old event-type canonicals may still need to be
    // marked dormant even on quiet days with no recent canonical activity.
    const dormancyTransitions = await decayStaleCanonicals(db);
    logger.info("reconcile_phase7_decay", {
      event: "reconcile_phase7_decay",
      dormancyTransitions,
      phase1Empty: true,
    });
    return {
      ...EMPTY_SUMMARY(now().getTime() - startMs),
      malformedEmbeddingCount,
      dormancyTransitions,
    };
  }

  // ───────── Phase 2 — cluster ─────────
  const clusterInput: ClusterRow[] = rows.map((r) => ({
    id: r.id,
    embedding: r.embedding,
  }));
  const { clusters } = deps.clusterByIdentityEmbedding(clusterInput, {
    eps: RECONCILE_DBSCAN_EPS,
    minPoints: RECONCILE_DBSCAN_MIN_POINTS,
  });

  const rowsById = new Map<number, CanonicalRow>();
  for (const r of rows) rowsById.set(r.id, r);

  // Counters
  let clustersSeen = 0;
  let clustersFailed = 0;
  let clustersDeferred = 0;
  // malformedEmbeddingCount already accumulated in Phase 1 filter above.
  let clustersSkippedWinnerAlreadyMerged = 0;
  let mergesExecuted = 0;
  let mergesFailed = 0;
  let mergesRejectedByPairwise = 0;
  let mergesSkippedAlreadyMerged = 0;
  let pairwiseVerifyThrew = 0;
  let pairwiseVerifyRejected = 0;

  const mergedLoserIds = new Set<number>();
  const preMergeCounts = new Map<number, number>();
  const affectedWinners = new Set<number>();

  // ───────── Phases 3–5 — per-cluster orchestration ─────────
  for (let i = 0; i < clusters.length; i++) {
    // Phase 6 budget guard (ADR-048 §6) — top of every cluster iteration.
    if (now().getTime() - startMs > RECONCILE_BUDGET_MS) {
      const remaining = clusters.length - i;
      clustersDeferred += remaining;
      logger.warn("reconcile_budget_exhausted", {
        processed: i,
        deferred: remaining,
      });
      break;
    }

    const cluster = clusters[i];
    clustersSeen++;

    let currentPhase: "winner_pick" | "pairwise_verify" | "merge" =
      "winner_pick";
    let clusterWinnerId: number | null = null;

    try {
      // ───────── Phase 3 — winner pick ─────────
      const members: ReconcileMember[] = cluster
        .map((id) => rowsById.get(id))
        .filter((r): r is CanonicalRow => r !== undefined)
        .map((r) => ({
          id: r.id,
          label: r.label,
          kind: r.kind,
          summary: r.summary,
        }));

      if (members.length < 2) {
        // Defensive: a cluster whose ids no longer resolve to fetched rows.
        continue;
      }

      const winnerPickPrompt = getReconcileWinnerPickPrompt(members);
      const winnerRaw = await generateCompletion([
        { role: "user", content: winnerPickPrompt },
      ]);
      const winnerParsed = reconcileWinnerPickSchema.parse(
        parseJsonResponse(winnerRaw),
      );
      const { winner_id: winnerId } = winnerParsed;

      if (winnerId === null || !cluster.includes(winnerId)) {
        // null = no-confidence; not-in-cluster = model hallucination guard.
        continue;
      }

      if (mergedLoserIds.has(winnerId)) {
        // Winner was already merged as a loser in a prior cluster — DBSCAN
        // can produce overlapping clusters with custom distance fns
        // (ADR-048 §7). Merging onto an already-merged canonical would cause
        // corruption + chains; skip the cluster entirely.
        clustersSkippedWinnerAlreadyMerged++;
        continue;
      }

      clusterWinnerId = winnerId;

      const winner = rowsById.get(winnerId);
      if (!winner) continue;

      // ───────── Phase 4 — pairwise verify (per-pair partial-accept) ─────────
      currentPhase = "pairwise_verify";
      const losers = cluster.filter((id) => id !== winnerId);
      const verifiedLosers: number[] = [];
      let clusterHadRejection = false;

      for (const loserId of losers) {
        const loser = rowsById.get(loserId);
        if (!loser) {
          // Defensive: cluster id has no fetched row (invariant violation).
          // Count on the throws side — it's an infra signal, not a model
          // verdict.
          clusterHadRejection = true;
          pairwiseVerifyThrew++;
          continue;
        }
        try {
          const verifyPrompt = getReconcilePairwiseVerifyPrompt(winner, loser);
          const verifyRaw = await generateCompletion([
            { role: "user", content: verifyPrompt },
          ]);
          const verifyParsed = reconcilePairwiseVerifySchema.parse(
            parseJsonResponse(verifyRaw),
          );
          if (verifyParsed.same_entity) {
            verifiedLosers.push(loserId);
          } else {
            clusterHadRejection = true;
            pairwiseVerifyRejected++;
          }
        } catch (err) {
          // Treat failure as "no" (ADR-048 §3) — preserves R3 over-merge guard.
          clusterHadRejection = true;
          pairwiseVerifyThrew++;
          logger.warn("reconcile_pairwise_verify_failed", {
            winnerId,
            loserId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (clusterHadRejection && verifiedLosers.length === 0) {
        mergesRejectedByPairwise++;
      }

      // ───────── Phase 5 — merge per verified loser ─────────
      currentPhase = "merge";
      for (const loserId of verifiedLosers) {
        if (mergedLoserIds.has(loserId)) {
          // Cross-cluster overlap guard (ADR-048 §7).
          mergesSkippedAlreadyMerged++;
          continue;
        }
        if (!preMergeCounts.has(winnerId)) {
          preMergeCounts.set(
            winnerId,
            await countEpisodesForCanonical(db, winnerId),
          );
        }
        try {
          await mergeCanonicals({
            loserId,
            winnerId,
            actor: "reconcile-canonicals",
          });
          mergedLoserIds.add(loserId);
          affectedWinners.add(winnerId);
          mergesExecuted++;
        } catch (err) {
          mergesFailed++;
          logger.warn("reconcile_merge_failed", {
            winnerId,
            loserId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      clustersFailed++;
      logger.warn("reconcile_cluster_failed", {
        clusterIndex: i,
        phase: currentPhase,
        memberIds: cluster,
        winnerId: clusterWinnerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ───────── Phase 6 — drift compute (true delta) ─────────
  let episodeCountDrift = 0;
  const affectedWinnerIds = Array.from(affectedWinners);
  for (const winnerId of affectedWinnerIds) {
    const post = await countEpisodesForCanonical(db, winnerId);
    const pre = preMergeCounts.get(winnerId) ?? 0;
    episodeCountDrift += post - pre;
  }

  // ───────── Phase 7 — decay stale event-type canonicals ─────────
  const dormancyTransitions = await decayStaleCanonicals(db);
  logger.info("reconcile_phase7_decay", {
    event: "reconcile_phase7_decay",
    dormancyTransitions,
    phase1Empty: false,
  });

  return {
    clustersSeen,
    clustersFailed,
    clustersDeferred,
    malformedEmbeddingCount,
    clustersSkippedWinnerAlreadyMerged,
    mergesExecuted,
    mergesFailed,
    mergesRejectedByPairwise,
    mergesSkippedAlreadyMerged,
    pairwiseVerifyThrew,
    pairwiseVerifyRejected,
    dormancyTransitions,
    episodeCountDrift,
    durationMs: now().getTime() - startMs,
  };
}
