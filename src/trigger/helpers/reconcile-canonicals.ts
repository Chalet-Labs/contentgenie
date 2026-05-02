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
import { ReconcileSummaryAccumulator } from "./reconcile-summary-accumulator";

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

/**
 * Best-effort coerce of the `identity_embedding` column the DB driver returns.
 * Postgres `vector` may surface as `number[]` (pg JSON path), `string`
 * (`"[1,2,3]"`), or `Float32Array`. The clustering helper expects `number[]`.
 *
 * Returns `null` when the input is malformed: any NaN/non-finite element,
 * empty vector, zero-norm vector (would produce NaN in cosineDistance), or
 * unrecognised shape.
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
      if (inner.length === 0) return null;
      arr = inner
        .split(",")
        .filter(Boolean)
        .map((s) => Number(s.trim()));
    } else {
      return null;
    }
  } else {
    return null;
  }
  // Guard: any NaN or ±Infinity element taints the whole vector.
  if (arr.some((x) => !Number.isFinite(x))) return null;
  // Guard: empty or zero-norm vectors produce NaN in cosineDistance.
  if (arr.length === 0) return null;
  const squaredNorm = arr.reduce((sum, x) => sum + x * x, 0);
  if (squaredNorm === 0) return null;
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
 * everywhere else in the app (PR #424 / ADR-050 §4).
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
  verifiedLoserIds: number[];
  pairwiseVerifyThrew: number;
  pairwiseVerifyRejected: number;
  /** True iff ≥1 pair returned `same_entity=false`. Drives cluster-level rejection. */
  hadModelReject: boolean;
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
  let hadModelReject = false;

  for (const loserId of loserIds) {
    const loser = rowsById.get(loserId);
    if (!loser) {
      // Defensive: cluster id has no fetched row (invariant violation).
      // Count on the throws side — it's an infra signal, not a model verdict.
      pairwiseVerifyThrew++;
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
        hadModelReject = true;
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

  return {
    verifiedLoserIds,
    pairwiseVerifyThrew,
    pairwiseVerifyRejected,
    hadModelReject,
  };
}

/** Mutable cross-cluster state owned by the orchestrator and threaded through per-cluster helpers. */
interface ClusterState {
  mergedLoserIds: Set<number>;
  preMergeCounts: Map<number, number>;
  affectedWinners: Set<number>;
  winnerToAbsorbedLosers: Map<number, number[]>;
}

/** Phase 5 — merge each verified loser. Mutates the shared cross-cluster state + accumulator. */
async function mergeVerifiedLosers(
  deps: Pick<ReconcileDeps, "db" | "mergeCanonicals" | "logger">,
  winnerId: number,
  verifiedLoserIds: number[],
  state: ClusterState,
  accum: ReconcileSummaryAccumulator,
): Promise<void> {
  const {
    mergedLoserIds,
    preMergeCounts,
    affectedWinners,
    winnerToAbsorbedLosers,
  } = state;

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
      const absorbed = winnerToAbsorbedLosers.get(winnerId) ?? [];
      absorbed.push(loserId);
      winnerToAbsorbedLosers.set(winnerId, absorbed);
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
  let delta = 0;
  for (const winnerId of Array.from(affectedWinners)) {
    const post = await countEpisodesForCanonical(database, winnerId);
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
 * Resolve-forward: if any verified loser was itself a winner in a prior
 * cluster, include its prior absorptions so we never produce chains
 * (e.g. 3→2→1 instead of direct 3→1 and 2→1).
 */
function resolveTransitiveLosers(
  verifiedLosers: number[],
  affectedWinners: Set<number>,
  winnerToAbsorbedLosers: Map<number, number[]>,
  mergedLoserIds: Set<number>,
): number[] {
  const losersToMergeSet = new Set(verifiedLosers);
  for (const loserId of verifiedLosers) {
    if (affectedWinners.has(loserId)) {
      for (const priorId of winnerToAbsorbedLosers.get(loserId) ?? []) {
        if (!mergedLoserIds.has(priorId)) {
          losersToMergeSet.add(priorId);
        }
      }
    }
  }
  return Array.from(losersToMergeSet);
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
    if (!winner) return;

    currentPhase = "pairwise_verify";
    const losers = cluster.filter((id) => id !== winnerId);
    const verify = await verifyLosers(deps, winner, losers, rowsById);
    accum.pairwiseVerifyThrew(verify.pairwiseVerifyThrew);
    accum.pairwiseVerifyRejected(verify.pairwiseVerifyRejected);
    if (verify.hadModelReject && verify.verifiedLoserIds.length === 0) {
      accum.clusterRejectedByPairwise();
    }

    currentPhase = "merge";
    const losersToMerge = resolveTransitiveLosers(
      verify.verifiedLoserIds,
      state.affectedWinners,
      state.winnerToAbsorbedLosers,
      state.mergedLoserIds,
    );
    await mergeVerifiedLosers(deps, winnerId, losersToMerge, state, accum);
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

  // Cross-cluster state owned by the orchestrator (ADR-050 §7)
  const mergedLoserIds = new Set<number>();
  const preMergeCounts = new Map<number, number>();
  const affectedWinners = new Set<number>();
  // Maps each winner to every entity it has absorbed (directly or via chain
  // resolution) so later clusters can re-point transitive losers and avoid
  // A→B→C chains when mergeCanonicals only rewrites the direct loser.
  const winnerToAbsorbedLosers = new Map<number, number[]>();

  // Phases 3–5 — per-cluster orchestration
  const state: ClusterState = {
    mergedLoserIds,
    preMergeCounts,
    affectedWinners,
    winnerToAbsorbedLosers,
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
