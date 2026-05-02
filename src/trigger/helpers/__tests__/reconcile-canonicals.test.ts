// @vitest-environment node

/**
 * Unit tests for `runReconciliation` (T4 — issue #389).
 *
 * The helper is dependency-injected by design; these tests pass fully-mocked
 * `db`, `mergeCanonicals`, `generateCompletion`, `clusterByIdentityEmbedding`,
 * `logger`, and `now` shims. No real DB, no real LLM, no real clustering —
 * the orchestration logic is what is under test.
 *
 * Coverage matrix (from T4 description in plan-20260502-0053.md):
 *   (a) empty Phase 1
 *   (b) two-cluster all-verified happy path
 *   (c) winner_id null → cluster skipped
 *   (d) winner_id not in cluster → cluster skipped
 *   (e) partial-accept (loser1 yes, loser2 no)
 *   (e2) full reject (both losers no)
 *   (f) verify-throws on one loser, sibling still merges
 *   (g) merge throws → mergesFailed++, run continues
 *   (h) drift delta value
 *   (i) idempotence (post-merge state → no clusters)
 *   (j) time-budget guard
 *   (k) cross-cluster overlap guard
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReconcileDeps } from "@/trigger/helpers/reconcile-canonicals";
import { runReconciliation } from "@/trigger/helpers/reconcile-canonicals";
import {
  RECONCILE_BUDGET_MS,
  RECONCILE_DECAY_DAYS,
  RECONCILE_DECAY_KINDS,
} from "@/lib/reconcile-constants";

// ─── SQL inspection helper ─────────────────────────────────────────────────

/**
 * Walk a Drizzle `sql` template-literal object and extract the raw SQL text
 * fragments (with bind params replaced by `$`) and the bound parameter values.
 *
 * This mirrors the same helper in `database-canonical.test.ts`. It is
 * duplicated here rather than imported to keep test files self-contained and
 * avoid coupling to another test module's internals.
 */
function serializeSql(sqlObj: unknown): { sqlText: string; params: unknown[] } {
  const params: unknown[] = [];
  const parts: string[] = [];
  const visit = (chunk: unknown) => {
    if (chunk == null) return;
    if (Array.isArray(chunk)) {
      chunk.forEach(visit);
      return;
    }
    if (
      typeof chunk === "string" ||
      typeof chunk === "number" ||
      typeof chunk === "boolean"
    ) {
      params.push(chunk);
      parts.push("$");
      return;
    }
    const obj = chunk as { value?: unknown; queryChunks?: unknown[] };
    if (Array.isArray(obj.queryChunks)) {
      obj.queryChunks.forEach(visit);
      return;
    }
    if (Array.isArray(obj.value)) {
      parts.push(obj.value.join(""));
      return;
    }
    if (obj.value !== undefined) {
      params.push(obj.value);
      parts.push("$");
      return;
    }
  };
  visit(sqlObj);
  return { sqlText: parts.join(" "), params };
}

// ─── Test scaffolding ──────────────────────────────────────────────────────

type DbExecuteCall = (sqlObj: unknown) => Promise<{ rows: unknown[] }>;

/**
 * Build a queue-driven `db.execute` stub. The orchestrator calls execute in a
 * deterministic order: (1) Phase 1 SELECT, (n) per-winner pre-merge counts,
 * (n) per-winner post-merge counts, (1) Phase 7 decay UPDATE.
 *
 * The queue holds `{ rows }` payloads; each execute call pops one. Callers
 * configure the queue per-test to match the orchestrator's call sequence.
 */
function makeDbStub(payloads: Array<{ rows: unknown[] }>): {
  execute: DbExecuteCall;
  remaining: () => number;
  calls: unknown[];
} {
  const queue = [...payloads];
  const calls: unknown[] = [];
  const execute: DbExecuteCall = (sqlObj: unknown) => {
    calls.push(sqlObj);
    const next = queue.shift();
    if (!next) {
      throw new Error(
        `db.execute called more times than payloads provided (call #${
          calls.length
        })`,
      );
    }
    return Promise.resolve(next);
  };
  return {
    execute,
    remaining: () => queue.length,
    calls,
  };
}

function makeLogger(): ReconcileDeps["logger"] {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function row(
  id: number,
  label = `topic-${id}`,
  embedding: number[] = [1, 0, 0],
) {
  return {
    id,
    label,
    kind: "release" as const,
    summary: `summary-${id}`,
    identity_embedding: embedding,
  };
}

function fixedNow(epochMs: number): () => Date {
  return () => new Date(epochMs);
}

/**
 * `now()` stub that returns `start + advanceMs * callCount` so each call
 * returns a strictly increasing timestamp. Used to simulate budget exhaustion.
 */
function steppingNow(startMs: number, advanceMs: number): () => Date {
  let i = 0;
  return () => new Date(startMs + advanceMs * i++);
}

interface BuildDepsArgs {
  rows?: unknown[];
  clusters?: number[][];
  countQueue?: number[];
  decayRows?: Array<{ id: number }>;
  generateCompletion?: ReconcileDeps["generateCompletion"];
  mergeCanonicals?: ReconcileDeps["mergeCanonicals"];
  now?: ReconcileDeps["now"];
}

function buildDeps(args: BuildDepsArgs = {}): {
  deps: ReconcileDeps;
  db: ReturnType<typeof makeDbStub>;
  mergeCanonicalsMock: ReturnType<typeof vi.fn>;
  generateCompletionMock: ReturnType<typeof vi.fn>;
  clusterMock: ReturnType<typeof vi.fn>;
  logger: ReconcileDeps["logger"];
} {
  const phase1 = { rows: args.rows ?? [] };
  // The execute queue is: Phase 1, then alternating count(*) calls (pre/post),
  // then Phase 7 decay UPDATE. Tests provide the count queue and decay rows.
  const countPayloads = (args.countQueue ?? []).map((c) => ({
    rows: [{ count: c }],
  }));
  const decayPayload = { rows: args.decayRows ?? [] };
  const db = makeDbStub([phase1, ...countPayloads, decayPayload]);

  const generateCompletionMock =
    (args.generateCompletion as ReturnType<typeof vi.fn>) ??
    vi.fn().mockResolvedValue("{}");
  const mergeCanonicalsMock =
    (args.mergeCanonicals as ReturnType<typeof vi.fn>) ??
    vi.fn().mockResolvedValue({
      loserId: 0,
      winnerId: 0,
      episodesReassigned: 0,
      conflictsDropped: 0,
      aliasesCopied: 0,
    });
  const clusterMock = vi.fn().mockReturnValue({
    clusters: args.clusters ?? [],
  });
  const logger = makeLogger();

  const deps = {
    db: { execute: db.execute } as unknown as ReconcileDeps["db"],
    mergeCanonicals:
      mergeCanonicalsMock as unknown as ReconcileDeps["mergeCanonicals"],
    generateCompletion:
      generateCompletionMock as unknown as ReconcileDeps["generateCompletion"],
    clusterByIdentityEmbedding:
      clusterMock as unknown as ReconcileDeps["clusterByIdentityEmbedding"],
    logger,
    now: args.now ?? fixedNow(1_700_000_000_000),
  } satisfies ReconcileDeps;

  return {
    deps,
    db,
    mergeCanonicalsMock,
    generateCompletionMock,
    clusterMock,
    logger,
  };
}

// ─── Cases ─────────────────────────────────────────────────────────────────

describe("runReconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // (a) empty Phase 1
  it("(a) returns all-zero summary when Phase 1 yields no rows", async () => {
    const { deps, mergeCanonicalsMock, clusterMock } = buildDeps({
      rows: [],
    });
    const summary = await runReconciliation(deps);

    expect(summary).toMatchObject({
      clustersSeen: 0,
      clustersFailed: 0,
      clustersDeferred: 0,
      mergesExecuted: 0,
      mergesFailed: 0,
      mergesRejectedByPairwise: 0,
      mergesSkippedAlreadyMerged: 0,
      pairwiseVerifyFailed: 0,
      dormancyTransitions: 0,
      episodeCountDrift: 0,
    });
    expect(typeof summary.durationMs).toBe("number");
    expect(clusterMock).not.toHaveBeenCalled();
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
  });

  // (b) two clusters, all verified true
  it("(b) merges every verified loser when both clusters fully verify", async () => {
    // Cluster A: winner=1, loser=2. Cluster B: winner=3, loser=4.
    // pre/post counts: pre[1]=1, pre[3]=2, post[1]=2, post[3]=4 → drift = (2-1)+(4-2)=3.
    const generateCompletion = vi
      .fn()
      // Cluster A — winner pick
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      // Cluster A — verify (winner=1, loser=2)
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }))
      // Cluster B — winner pick
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 3 }))
      // Cluster B — verify (winner=3, loser=4)
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }));

    const { deps, db, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2), row(3), row(4)],
      clusters: [
        [1, 2],
        [3, 4],
      ],
      generateCompletion,
      // Order: pre(winner=1), pre(winner=3), post(1), post(3), decay.
      // The decay payload comes from `decayRows`, not the count queue.
      countQueue: [1, 2, 2, 4],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(summary.clustersSeen).toBe(2);
    expect(summary.mergesExecuted).toBe(2);
    expect(summary.mergesRejectedByPairwise).toBe(0);
    expect(summary.episodeCountDrift).toBe(3);
    expect(summary.dormancyTransitions).toBe(0);
    expect(mergeCanonicalsMock).toHaveBeenCalledTimes(2);
    expect(mergeCanonicalsMock).toHaveBeenNthCalledWith(1, {
      loserId: 2,
      winnerId: 1,
      actor: "reconcile-canonicals",
    });
    expect(mergeCanonicalsMock).toHaveBeenNthCalledWith(2, {
      loserId: 4,
      winnerId: 3,
      actor: "reconcile-canonicals",
    });
    expect(db.remaining()).toBe(0);
  });

  // (c) winner_id null → cluster skipped
  it("(c) skips the cluster when winner_id is null", async () => {
    const generateCompletion = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ winner_id: null }));

    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2)],
      clusters: [[1, 2]],
      generateCompletion,
      countQueue: [],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.clustersSeen).toBe(1);
    expect(summary.mergesExecuted).toBe(0);
    expect(summary.mergesRejectedByPairwise).toBe(0);
    expect(summary.pairwiseVerifyFailed).toBe(0);
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    // Only the winner-pick LLM call should have fired (no Stage B).
    expect(generateCompletion).toHaveBeenCalledTimes(1);
  });

  // (d) winner_id not in cluster (model hallucination guard)
  it("(d) skips the cluster when winner_id is not a cluster member", async () => {
    const generateCompletion = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 999 }));

    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2)],
      clusters: [[1, 2]],
      generateCompletion,
      countQueue: [],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.clustersSeen).toBe(1);
    expect(summary.mergesExecuted).toBe(0);
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    expect(generateCompletion).toHaveBeenCalledTimes(1);
  });

  // (e) partial-accept: loser1 yes, loser2 no
  it("(e) partial-accept — verified loser merges, rejected loser does not, mergesRejectedByPairwise=0", async () => {
    const generateCompletion = vi
      .fn()
      // Stage A — winner pick → 1
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      // Stage B — loser=2 → yes
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }))
      // Stage B — loser=3 → no
      .mockResolvedValueOnce(JSON.stringify({ same_entity: false }));

    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2), row(3)],
      clusters: [[1, 2, 3]],
      generateCompletion,
      countQueue: [5, 6], // pre(1)=5, post(1)=6
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(summary.clustersSeen).toBe(1);
    expect(summary.mergesExecuted).toBe(1);
    expect(summary.mergesRejectedByPairwise).toBe(0);
    expect(summary.pairwiseVerifyFailed).toBe(1);
    expect(summary.episodeCountDrift).toBe(1);
    expect(mergeCanonicalsMock).toHaveBeenCalledTimes(1);
    expect(mergeCanonicalsMock).toHaveBeenCalledWith({
      loserId: 2,
      winnerId: 1,
      actor: "reconcile-canonicals",
    });
  });

  // (e2) full reject: both losers no
  it("(e2) full-reject — no merges, mergesRejectedByPairwise=1", async () => {
    const generateCompletion = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: false }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: false }));

    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2), row(3)],
      clusters: [[1, 2, 3]],
      generateCompletion,
      countQueue: [],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.clustersSeen).toBe(1);
    expect(summary.mergesExecuted).toBe(0);
    expect(summary.mergesRejectedByPairwise).toBe(1);
    expect(summary.pairwiseVerifyFailed).toBe(2);
    expect(summary.episodeCountDrift).toBe(0);
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
  });

  // (f) verify throws on one loser, sibling verified loser still merges
  it("(f) verify-throw on one loser does not block the verified sibling from merging", async () => {
    const generateCompletion = vi
      .fn()
      // winner pick
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      // loser=2 → yes
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }))
      // loser=3 → throws
      .mockRejectedValueOnce(new Error("openrouter blip"));

    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2), row(3)],
      clusters: [[1, 2, 3]],
      generateCompletion,
      countQueue: [3, 4],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.mergesExecuted).toBe(1);
    expect(summary.pairwiseVerifyFailed).toBe(1);
    // verifiedLosers contained loser=2 → the cluster partially accepted, not
    // outright-rejected; mergesRejectedByPairwise must stay 0.
    expect(summary.mergesRejectedByPairwise).toBe(0);
    expect(summary.episodeCountDrift).toBe(1);
    expect(mergeCanonicalsMock).toHaveBeenCalledWith({
      loserId: 2,
      winnerId: 1,
      actor: "reconcile-canonicals",
    });
  });

  // (g) merge throws → mergesFailed++, run continues
  it("(g) merge throws — mergesFailed increments, run continues to next cluster", async () => {
    const generateCompletion = vi
      .fn()
      // Cluster A — winner=1, loser=2 verified
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }))
      // Cluster B — winner=3, loser=4 verified
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 3 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }));

    const mergeCanonicals = vi
      .fn()
      .mockRejectedValueOnce(new Error("not-active")) // Cluster A
      .mockResolvedValueOnce({
        loserId: 4,
        winnerId: 3,
        episodesReassigned: 1,
        conflictsDropped: 0,
        aliasesCopied: 0,
      }); // Cluster B

    const { deps } = buildDeps({
      rows: [row(1), row(2), row(3), row(4)],
      clusters: [
        [1, 2],
        [3, 4],
      ],
      generateCompletion,
      mergeCanonicals,
      // pre(1)=2 captured before cluster A merge attempt (pre is captured
      // BEFORE the call, so even on failure the count was read);
      // pre(3)=5 before cluster B merge; post(3)=7 after cluster B.
      // Cluster A's failed merge does NOT add winner=1 to affectedWinners,
      // so post(1) is never queried.
      countQueue: [2, 5, 7],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.clustersSeen).toBe(2);
    expect(summary.mergesExecuted).toBe(1);
    expect(summary.mergesFailed).toBe(1);
    // Only winner=3 is in affectedWinners; drift = 7 - 5 = 2.
    expect(summary.episodeCountDrift).toBe(2);
  });

  // (h) drift delta value
  it("(h) episodeCountDrift is post − pre delta, not the post count", async () => {
    const generateCompletion = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }));

    const { deps } = buildDeps({
      rows: [row(1), row(2)],
      clusters: [[1, 2]],
      generateCompletion,
      // Winner 1 has 2 episodes pre-merge, gains 2 from loser → post=4.
      // Drift must be 4 − 2 = 2, not 4.
      countQueue: [2, 4],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.mergesExecuted).toBe(1);
    expect(summary.episodeCountDrift).toBe(2);
  });

  // (i) idempotence: post-merge state → no clusters → all-zero summary
  it("(i) idempotence — input is post-merge state, DBSCAN returns no clusters, all-zero", async () => {
    const { deps, mergeCanonicalsMock, generateCompletionMock } = buildDeps({
      rows: [row(1)],
      clusters: [], // Singletons drop, only winner remains active.
      countQueue: [],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.clustersSeen).toBe(0);
    expect(summary.mergesExecuted).toBe(0);
    expect(summary.episodeCountDrift).toBe(0);
    expect(summary.dormancyTransitions).toBe(0);
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    expect(generateCompletionMock).not.toHaveBeenCalled();
  });

  // (j) time-budget guard
  it("(j) time-budget exhausted mid-loop — remaining clusters increment clustersDeferred, Phase 6/7 still run", async () => {
    const generateCompletion = vi
      .fn()
      // Only cluster #1 fully runs; clusters #2..#5 must be deferred.
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }));

    // The orchestrator calls now() at:
    //   call 1 → startMs
    //   call 2 → top of cluster #1 (in-budget)
    //   call 3 → top of cluster #2 (over-budget → defer remaining 4)
    //   call 4 → durationMs (return)
    // We make every call after #2 jump past the budget.
    const start = 1_700_000_000_000;
    const advance = RECONCILE_BUDGET_MS / 2 + 1;
    const now = steppingNow(start, advance);

    const { deps } = buildDeps({
      rows: [
        row(1),
        row(2),
        row(3),
        row(4),
        row(5),
        row(6),
        row(7),
        row(8),
        row(9),
        row(10),
      ],
      clusters: [
        [1, 2],
        [3, 4],
        [5, 6],
        [7, 8],
        [9, 10],
      ],
      generateCompletion,
      // Cluster #1 captures pre(1) and contributes to affectedWinners.
      // Phase 6 reads post(1). Then Phase 7 returns 1 dormancy row.
      countQueue: [3, 5],
      decayRows: [{ id: 99 }],
      now,
    });

    const summary = await runReconciliation(deps);

    expect(summary.clustersSeen).toBe(1);
    expect(summary.clustersDeferred).toBe(4);
    expect(summary.mergesExecuted).toBe(1);
    // Phase 6 ran (drift computed from cluster #1's merge).
    expect(summary.episodeCountDrift).toBe(2);
    // Phase 7 ran (decay row counted).
    expect(summary.dormancyTransitions).toBe(1);
  });

  // (k) cross-cluster overlap guard
  it("(k) duplicate loser across clusters — first merges, second increments mergesSkippedAlreadyMerged", async () => {
    // Cluster A: [1, 2]. Cluster B: [3, 2]. The shared loser is id=2.
    // In Cluster A, winner=1 picks loser=2 (verified) → merge.
    // In Cluster B, winner=3 picks loser=2 (verified) → guard kicks in.
    const generateCompletion = vi
      .fn()
      // Cluster A
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }))
      // Cluster B
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 3 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }));

    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2), row(3)],
      clusters: [
        [1, 2],
        [3, 2],
      ],
      generateCompletion,
      // Only cluster A actually merges → only winner=1 in affectedWinners.
      // Cluster B's pre-count for winner=3 is NOT captured (skip happens
      // before pre-count read). Phase 6 reads post(1) only.
      countQueue: [4, 6],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(summary.mergesExecuted).toBe(1);
    expect(summary.mergesSkippedAlreadyMerged).toBe(1);
    expect(summary.mergesFailed).toBe(0);
    expect(mergeCanonicalsMock).toHaveBeenCalledTimes(1);
    expect(mergeCanonicalsMock).toHaveBeenCalledWith({
      loserId: 2,
      winnerId: 1,
      actor: "reconcile-canonicals",
    });
    // Cluster A drift: post(1)=6 − pre(1)=4 = 2. Cluster B contributed nothing.
    expect(summary.episodeCountDrift).toBe(2);
  });
});

// ─── Phase 7 — decay matrix ────────────────────────────────────────────────

/**
 * T6 decay-matrix tests (issue #389).
 *
 * These tests validate the SQL predicate that Phase 7 issues via
 * `db.execute`. Because the helper uses dependency-injected `db`, we capture
 * every `execute` call and inspect the serialized SQL text + parameters to
 * assert that:
 *   - `status = 'active'` guards the WHERE clause (status='merged' rows are
 *     excluded by the filter, not the kind list).
 *   - `ongoing = false` is part of the predicate (ongoing=true rows exempt).
 *   - The kind filter is `kind = ANY(...)` using the RECONCILE_DECAY_KINDS
 *     whitelist, which includes `event`/`release` etc. but excludes
 *     `concept` and `work`.
 *   - `last_seen < now() - (180::int * INTERVAL '1 day')` uses
 *     RECONCILE_DECAY_DAYS = 180.
 *
 * We cannot run a real SQL engine in unit scope, so the "concept stays active"
 * behavioral guarantee is expressed as a static-analysis assertion:
 * the SQL predicate provably excludes `concept` because it is absent from
 * `RECONCILE_DECAY_KINDS`. Each `it.each` row documents which predicate
 * operand is responsible for the exclusion.
 *
 * Deviation from plan T6 note "extends T5's file": the SQL is issued inside
 * `decayStaleCanonicals` in the helper (`src/trigger/helpers/reconcile-canonicals.ts`),
 * not in the task wrapper. Testing SQL predicates at the task layer would only
 * be possible if we un-mocked `runReconciliation` — the helper test file is
 * the correct home for SQL-level assertions.
 */
describe("Phase 7 — decay matrix", () => {
  /**
   * Run a minimal reconciliation (empty Phase 1 so no cluster/merge work) and
   * return the serialized Phase 7 UPDATE SQL + params that `db.execute` was
   * called with.
   *
   * `db.execute` receives exactly two calls when Phase 1 returns no rows:
   *   call 0 → Phase 1 SELECT (empty → early-return path is skipped because
   *             we use a non-empty rows array to force Phase 7 to always run)
   *   call N-1 → Phase 7 UPDATE
   *
   * To guarantee Phase 7 runs we supply at least one Phase 1 row but zero
   * clusters (DBSCAN returns nothing). The execute queue is:
   *   [0] Phase 1 payload, [1] Phase 7 decay payload.
   */
  async function runAndCaptureDecaySql(decayRows: Array<{ id: number }> = []) {
    const { deps, db } = buildDeps({
      // One row in Phase 1 so the early-return branch is NOT taken.
      rows: [row(1)],
      clusters: [], // No clusters → phases 3–5 are skipped entirely.
      countQueue: [], // No merges → no count queries.
      decayRows,
    });

    await runReconciliation(deps);

    // The last execute call is always the Phase 7 UPDATE.
    const lastCall = db.calls[db.calls.length - 1];
    return serializeSql(lastCall);
  }

  // Shared SQL structure assertions re-used across every row in the matrix.
  function assertPhase7SqlStructure(sqlText: string, params: unknown[]): void {
    // UPDATE target
    expect(sqlText).toMatch(/UPDATE\s+canonical_topics/i);
    // SET clause flips to dormant
    expect(sqlText).toMatch(/SET\s+status\s*=\s*'dormant'/i);
    // Status guard: only active rows are candidates
    expect(sqlText).toMatch(/WHERE\s+status\s*=\s*'active'/i);
    // Ongoing guard: ongoing=true rows are exempt
    expect(sqlText).toMatch(/ongoing\s*=\s*false/i);
    // Kind filter uses ANY(...)
    expect(sqlText).toMatch(/kind\s*=\s*ANY\s*\(/i);
    // Decay threshold uses RECONCILE_DECAY_DAYS param
    expect(sqlText).toMatch(/last_seen\s*</i);
    expect(params).toContain(RECONCILE_DECAY_DAYS);
    // RETURNING clause (used by decayStaleCanonicals to count rows)
    expect(sqlText).toMatch(/RETURNING\s+id/i);
  }

  it("Phase 7 SQL includes `status='active'`, `ongoing=false`, kind=ANY whitelist, and 180-day threshold", async () => {
    const { sqlText, params } = await runAndCaptureDecaySql([]);
    assertPhase7SqlStructure(sqlText, params);
  });

  it("RECONCILE_DECAY_KINDS whitelist includes `event` and `release`", () => {
    // Static assertion: confirms that scenario (1) [event] and (4) [release]
    // would be matched by the kind predicate.
    expect(RECONCILE_DECAY_KINDS).toContain("event");
    expect(RECONCILE_DECAY_KINDS).toContain("release");
  });

  it("RECONCILE_DECAY_KINDS whitelist excludes `concept` and `work`", () => {
    // Static assertion: scenario (2) [concept stays active].
    // `concept` is not in the whitelist, so the SQL predicate's ANY() clause
    // will never match a concept-kind row → concept canonicals never decay.
    expect(RECONCILE_DECAY_KINDS).not.toContain("concept");
    expect(RECONCILE_DECAY_KINDS).not.toContain("work");
  });

  it("RECONCILE_DECAY_DAYS is 180, enforcing the 181-day flip / 179-day boundary semantics", () => {
    // Static assertion: scenario (1) [181d → dormant] passes the < 180d
    // threshold; scenario (4) [179d → stays active] does not.
    expect(RECONCILE_DECAY_DAYS).toBe(180);
  });

  // Table-driven matrix: five decay scenarios from plan T6 + issue VERIFY.
  //
  // Columns:
  //   label      — human-readable scenario name
  //   kind       — canonical_topic kind value
  //   daysOld    — how many days ago `last_seen` was set
  //   ongoing    — value of the `ongoing` column
  //   status     — row's current status
  //   predicateExcludes — which predicate operand prevents the decay
  //   expectedDecayable — whether the row *would* satisfy the WHERE predicate
  //                       (true = flips to dormant; false = stays unchanged)
  //
  // Note: because we assert the SQL predicate composition rather than executing
  // real SQL, `expectedDecayable` is documented as a comment rather than a
  // runtime assertion — it records the behavioral expectation for the record.
  it.each([
    {
      label:
        "event kind, 181d old, ongoing=false → satisfies all predicates (would flip to dormant)",
      kind: "event",
      daysOld: 181,
      ongoing: false,
      status: "active",
      predicateExcludes: null, // nothing excludes it — it decays
      expectedDecayable: true,
    },
    {
      label:
        "concept kind, 181d old, ongoing=false → excluded by kind whitelist (stays active)",
      kind: "concept",
      daysOld: 181,
      ongoing: false,
      status: "active",
      predicateExcludes: "kind whitelist",
      expectedDecayable: false,
    },
    {
      label:
        "event kind, 181d old, ongoing=true → excluded by ongoing=false predicate (stays active)",
      kind: "event",
      daysOld: 181,
      ongoing: true,
      status: "active",
      predicateExcludes: "ongoing=false predicate",
      expectedDecayable: false,
    },
    {
      label:
        "release kind, 179d old, ongoing=false → excluded by < 180d threshold (stays active)",
      kind: "release",
      daysOld: 179,
      ongoing: false,
      status: "active",
      predicateExcludes: "180-day threshold (179d < threshold not satisfied)",
      expectedDecayable: false,
    },
    {
      label:
        "merged status row, old last_seen → excluded by status='active' guard (stays merged)",
      kind: "event",
      daysOld: 365,
      ongoing: false,
      status: "merged",
      predicateExcludes: "status='active' guard",
      expectedDecayable: false,
    },
  ])("$label", async ({ kind, expectedDecayable, predicateExcludes }) => {
    const { sqlText, params } = await runAndCaptureDecaySql([]);

    // Every scenario goes through the same Phase 7 SQL; the predicate
    // composition is what we're testing.
    assertPhase7SqlStructure(sqlText, params);

    // Scenario-specific structural assertion:
    // The Drizzle sql`` template flattens the kinds array into individual
    // positional params (one string per kind) rather than an array param.
    // See serializeSql: `Array.isArray(chunk) → chunk.forEach(visit)`.
    const kindParams = params.filter((p) => typeof p === "string") as string[];

    if (!expectedDecayable) {
      if (predicateExcludes === "kind whitelist") {
        // `concept` and `work` must be absent from the bound kind params.
        expect(kindParams).not.toContain(kind);
        // At least one whitelisted kind must be present (e.g. 'event').
        expect(
          kindParams.some((k) => RECONCILE_DECAY_KINDS.includes(k as never)),
        ).toBe(true);
      } else if (predicateExcludes === "ongoing=false predicate") {
        // SQL must contain `ongoing = false` so ongoing=true rows are skipped.
        expect(sqlText).toMatch(/ongoing\s*=\s*false/i);
      } else if (
        predicateExcludes ===
        "180-day threshold (179d < threshold not satisfied)"
      ) {
        // RECONCILE_DECAY_DAYS must be 180 — 179 days does not cross it.
        expect(RECONCILE_DECAY_DAYS).toBe(180);
        expect(params).toContain(180);
      } else if (predicateExcludes === "status='active' guard") {
        // SQL must begin the WHERE clause with `status = 'active'`.
        expect(sqlText).toMatch(/WHERE\s+status\s*=\s*'active'/i);
      }
    } else {
      // Scenario (1): event, 181d old, ongoing=false — all predicates must
      // be satisfiable. `event` must be in the bound kind params.
      expect(kindParams).toContain(kind);
      expect(RECONCILE_DECAY_DAYS).toBe(180);
    }
  });
});
