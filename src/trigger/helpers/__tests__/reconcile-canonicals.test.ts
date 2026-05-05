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
  RECONCILE_LOOKBACK_DAYS,
} from "@/lib/reconcile-constants";
import { makeDbExecuteStub } from "@/test/db-execute-stub";
import { serializeSql } from "@/test/sql-fixture-queue";

// ─── Test scaffolding ──────────────────────────────────────────────────────

// The orchestrator calls execute in a deterministic order: Phase 1 SELECT,
// per-winner pre-merge counts, per-winner post-merge counts, Phase 7 decay
// UPDATE. Each test seeds the queue accordingly.

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
  /** Per-winner pre-merge counts — one entry per winner, in merge order. */
  preCountQueue?: number[];
  /** Phase 6 batch post-merge counts — one entry per affected winner. */
  postBatchRows?: Array<{ id: number; count: number }>;
  decayRows?: Array<{ id: number }>;
  generateCompletion?: ReconcileDeps["generateCompletion"];
  mergeCanonicals?: ReconcileDeps["mergeCanonicals"];
  now?: ReconcileDeps["now"];
}

function buildDeps(args: BuildDepsArgs = {}): {
  deps: ReconcileDeps;
  db: ReturnType<typeof makeDbExecuteStub>;
  mergeCanonicalsMock: ReturnType<typeof vi.fn>;
  generateCompletionMock: ReturnType<typeof vi.fn>;
  clusterMock: ReturnType<typeof vi.fn>;
  logger: ReconcileDeps["logger"];
} {
  const phase1 = { rows: args.rows ?? [] };
  // Execute queue: Phase 1 → per-winner pre-merge counts → Phase 6 batch
  // post-merge count (one call for all affected winners) → Phase 7 decay.
  const preCountPayloads = (args.preCountQueue ?? []).map((c) => ({
    rows: [{ count: c }],
  }));
  const postBatchPayload = args.postBatchRows
    ? { rows: args.postBatchRows }
    : null;
  const decayPayload = { rows: args.decayRows ?? [] };
  const db = makeDbExecuteStub([
    phase1,
    ...preCountPayloads,
    ...(postBatchPayload ? [postBatchPayload] : []),
    decayPayload,
  ]);

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

  // (a) empty Phase 1 — clustering/merging skipped, but Phase 7 decay still runs
  it("(a) skips clustering/merging but runs Phase 7 decay when Phase 1 yields no rows", async () => {
    const { deps, mergeCanonicalsMock, clusterMock, generateCompletionMock } =
      buildDeps({
        rows: [],
        decayRows: [{ id: 10 }, { id: 11 }, { id: 12 }],
      });
    const summary = await runReconciliation(deps);

    // All cluster/merge counters must be zero.
    expect(summary).toMatchObject({
      clustersSeen: 0,
      clustersFailed: 0,
      clustersDeferred: 0,
      clustersSkippedWinnerAlreadyMerged: 0,
      mergesExecuted: 0,
      mergesFailed: 0,
      mergesRejectedByPairwise: 0,
      mergesSkippedAlreadyMerged: 0,
      pairwiseVerifyThrew: 0,
      pairwiseVerifyRejected: 0,
      episodeCountDrift: 0,
    });
    // Phase 7 ran and returned 3 dormancy transitions.
    expect(summary.dormancyTransitions).toBe(3);
    expect(typeof summary.durationMs).toBe("number");
    // No LLM calls, no merges, no clustering.
    expect(clusterMock).not.toHaveBeenCalled();
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    expect(generateCompletionMock).not.toHaveBeenCalled();
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
      preCountQueue: [1, 2], // pre(winner=1)=1, pre(winner=3)=2
      postBatchRows: [
        { id: 1, count: 2 },
        { id: 3, count: 4 },
      ], // post(1)=2, post(3)=4
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
    // F12: both clusters fully merged → outcome="merged" for each.
    expect(summary.clusterAudits.map((a) => a.outcome)).toEqual([
      "merged",
      "merged",
    ]);
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
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.clustersSeen).toBe(1);
    expect(summary.mergesExecuted).toBe(0);
    expect(summary.mergesRejectedByPairwise).toBe(0);
    expect(summary.pairwiseVerifyThrew).toBe(0);
    expect(summary.pairwiseVerifyRejected).toBe(0);
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    // Only the winner-pick LLM call should have fired (no Stage B).
    expect(generateCompletion).toHaveBeenCalledTimes(1);
    // F12: pickWinner returned skip (null) → outcome="skipped".
    expect(summary.clusterAudits).toHaveLength(1);
    expect(summary.clusterAudits[0].outcome).toBe("skipped");
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
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.clustersSeen).toBe(1);
    expect(summary.mergesExecuted).toBe(0);
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    expect(generateCompletion).toHaveBeenCalledTimes(1);
    // F12: winnerId not a member → pickWinner returned skip → outcome="skipped".
    expect(summary.clusterAudits).toHaveLength(1);
    expect(summary.clusterAudits[0].outcome).toBe("skipped");
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
      preCountQueue: [5], // pre(winner=1)=5
      postBatchRows: [{ id: 1, count: 6 }], // post(1)=6
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(summary.clustersSeen).toBe(1);
    expect(summary.mergesExecuted).toBe(1);
    expect(summary.mergesRejectedByPairwise).toBe(0);
    // loser=3 produced a `same_entity=false` verdict — model verdict, not a
    // throw. pairwiseVerifyRejected=1, pairwiseVerifyThrew=0.
    expect(summary.pairwiseVerifyRejected).toBe(1);
    expect(summary.pairwiseVerifyThrew).toBe(0);
    expect(summary.episodeCountDrift).toBe(1);
    expect(mergeCanonicalsMock).toHaveBeenCalledTimes(1);
    expect(mergeCanonicalsMock).toHaveBeenCalledWith({
      loserId: 2,
      winnerId: 1,
      actor: "reconcile-canonicals",
    });
    // F12: 1 verified merged + 1 model-rejected → outcome="partial".
    expect(summary.clusterAudits).toHaveLength(1);
    expect(summary.clusterAudits[0].outcome).toBe("partial");
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
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.clustersSeen).toBe(1);
    expect(summary.mergesExecuted).toBe(0);
    expect(summary.mergesRejectedByPairwise).toBe(1);
    // Both losers produced `same_entity=false` verdicts — pure model verdicts,
    // not throws. pairwiseVerifyRejected=2, pairwiseVerifyThrew=0.
    expect(summary.pairwiseVerifyRejected).toBe(2);
    expect(summary.pairwiseVerifyThrew).toBe(0);
    expect(summary.episodeCountDrift).toBe(0);
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    // F12: all losers model-rejected, none verified → outcome="rejected".
    expect(summary.clusterAudits).toHaveLength(1);
    expect(summary.clusterAudits[0].outcome).toBe("rejected");
  });

  // F7+F12: All-throws case → outcome="rejected" (was "partial" before fix).
  it("(F7) all verify-throws with no verified losers → outcome=rejected", async () => {
    // Cluster of 3 — pick winner=1; both verify calls throw. With F7, the
    // outcome must be "rejected" (throws act as rejection signal). Previously
    // the condition gated only on `pairwiseVerifyRejected > 0`, so this case
    // fell through to "partial".
    const generateCompletion = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      .mockRejectedValueOnce(new Error("openrouter blip 1"))
      .mockRejectedValueOnce(new Error("openrouter blip 2"));

    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2), row(3)],
      clusters: [[1, 2, 3]],
      generateCompletion,
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(summary.pairwiseVerifyThrew).toBe(2);
    expect(summary.pairwiseVerifyRejected).toBe(0);
    expect(summary.mergesExecuted).toBe(0);
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    // F7: throws + no verified losers → cluster counts as rejected.
    expect(summary.mergesRejectedByPairwise).toBe(1);
    expect(summary.clusterAudits).toHaveLength(1);
    expect(summary.clusterAudits[0].outcome).toBe("rejected");
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
      preCountQueue: [3], // pre(winner=1)=3
      postBatchRows: [{ id: 1, count: 4 }], // post(1)=4
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.mergesExecuted).toBe(1);
    // loser=3's verify call THREW (not a model "no" verdict). The throw is an
    // infra signal — pairwiseVerifyThrew=1, pairwiseVerifyRejected=0.
    expect(summary.pairwiseVerifyThrew).toBe(1);
    expect(summary.pairwiseVerifyRejected).toBe(0);
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
      // pre(1)=2 captured before cluster A merge attempt; pre(3)=5 before
      // cluster B merge. Cluster A's failed merge does NOT add winner=1 to
      // affectedWinners, so only winner=3 appears in the Phase 6 batch.
      preCountQueue: [2, 5],
      postBatchRows: [{ id: 3, count: 7 }], // post(3)=7
      decayRows: [],
    });

    const summary = await runReconciliation(deps);
    expect(summary.clustersSeen).toBe(2);
    expect(summary.mergesExecuted).toBe(1);
    expect(summary.mergesFailed).toBe(1);
    // Only winner=3 is in affectedWinners; drift = 7 - 5 = 2.
    expect(summary.episodeCountDrift).toBe(2);
    // F12: cluster A — verify yes but merge throws → mergesExecuted=0 against
    // verifiedLoserIds.length=1 → outcome="partial". Cluster B fully merged.
    expect(summary.clusterAudits.map((a) => a.outcome)).toEqual([
      "partial",
      "merged",
    ]);
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
      preCountQueue: [2],
      postBatchRows: [{ id: 1, count: 4 }],
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
      // Phase 6 batch reads post(1). Then Phase 7 returns 1 dormancy row.
      preCountQueue: [3],
      postBatchRows: [{ id: 1, count: 5 }],
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
      // before pre-count read). Phase 6 batch reads post(1) only.
      preCountQueue: [4],
      postBatchRows: [{ id: 1, count: 6 }],
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

  // (k2) winner was already merged as a loser in a prior cluster — skip cluster
  it("(k2) winner was already merged as a loser in a prior cluster — skip cluster", async () => {
    // Cluster A: [1, 2] — winner=1 verifies loser=2 → merge (mergedLoserIds={2}).
    // Cluster B: [2, 3] — Phase 3 picks winner=2, which is now already merged.
    // Expected: cluster B is skipped entirely; mergeCanonicals called only
    // once (for cluster A's merge); clustersSkippedWinnerAlreadyMerged=1.
    const generateCompletion = vi
      .fn()
      // Cluster A
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }))
      // Cluster B — winner=2 (already merged as loser in cluster A)
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 2 }));

    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2), row(3)],
      clusters: [
        [1, 2],
        [2, 3],
      ],
      generateCompletion,
      // Only cluster A merges → only winner=1 captured. Phase 6 batch reads post(1).
      preCountQueue: [4],
      postBatchRows: [{ id: 1, count: 6 }],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(summary.clustersSeen).toBe(2);
    expect(summary.clustersSkippedWinnerAlreadyMerged).toBe(1);
    expect(summary.mergesExecuted).toBe(1);
    expect(summary.mergesSkippedAlreadyMerged).toBe(0);
    expect(mergeCanonicalsMock).toHaveBeenCalledTimes(1);
    expect(mergeCanonicalsMock).toHaveBeenCalledWith({
      loserId: 2,
      winnerId: 1,
      actor: "reconcile-canonicals",
    });
    // No Stage B verify call should have fired for cluster B (skipped before
    // pairwise verify).
    expect(generateCompletion).toHaveBeenCalledTimes(3);
    expect(summary.episodeCountDrift).toBe(2);
    // F12: cluster A merged, cluster B skipped (winner already merged).
    expect(summary.clusterAudits.map((a) => a.outcome)).toEqual([
      "merged",
      "skipped",
    ]);
  });

  // (k3) Multi-step merge chain — cluster A merges 3→2, cluster B merges 2→1.
  // Both merges fire: 2 is a fresh loser in cluster B (only ID 3 is in
  // mergedLoserIds after cluster A), so the cross-cluster overlap guard does
  // not block it. Database-side chain resolution is handled at read time by
  // walkMergedChain (src/app/(app)/topic/[id]/merge-walker.ts), which is why
  // this orchestrator does not attempt to flatten chains itself.
  it("(k3) merge chain 3→2 then 2→1 — both mergeCanonicals calls fire, no skips", async () => {
    const generateCompletion = vi
      .fn()
      // Cluster A — winner=2, verify loser=3
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 2 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }))
      // Cluster B — winner=1, verify loser=2
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 1 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }));

    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2), row(3)],
      clusters: [
        [3, 2],
        [2, 1],
      ],
      generateCompletion,
      // Pre-merge counts captured JIT in merge order: pre(2), pre(1).
      preCountQueue: [4, 10],
      // Phase 6 batch query returns one row per affected winner.
      postBatchRows: [
        { id: 2, count: 4 },
        { id: 1, count: 12 },
      ],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(summary.clustersSeen).toBe(2);
    expect(summary.clustersFailed).toBe(0);
    expect(summary.mergesExecuted).toBe(2);
    expect(summary.mergesSkippedAlreadyMerged).toBe(0);
    expect(summary.mergesFailed).toBe(0);
    expect(mergeCanonicalsMock).toHaveBeenCalledTimes(2);
    expect(mergeCanonicalsMock).toHaveBeenNthCalledWith(1, {
      loserId: 3,
      winnerId: 2,
      actor: "reconcile-canonicals",
    });
    expect(mergeCanonicalsMock).toHaveBeenNthCalledWith(2, {
      loserId: 2,
      winnerId: 1,
      actor: "reconcile-canonicals",
    });
    // Drift = (post(2)-pre(2)) + (post(1)-pre(1)) = 0 + 2 = 2.
    expect(summary.episodeCountDrift).toBe(2);
  });

  // F12: catch path — generic phase throw produces outcome="failed".
  // Covered by the existing "winner-pick throw" test below; verify outcome
  // there. Also verify outcome="failed" for the winner-pick throw cluster.

  // F12: members.length < 2 → outcome="skipped"
  it("(F12) cluster with fewer than 2 fetchable members → outcome=skipped", async () => {
    // Single-ID cluster (DBSCAN typically wouldn't emit this, but the fail-safe
    // exists; the orchestrator still records an audit row).
    const generateCompletion = vi.fn();
    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1)],
      clusters: [[1]],
      generateCompletion,
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(generateCompletion).not.toHaveBeenCalled();
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    expect(summary.clusterAudits).toHaveLength(1);
    expect(summary.clusterAudits[0].outcome).toBe("skipped");
    expect(summary.clusterAudits[0].clusterSize).toBe(1);
  });

  // F12: pickWinner returns a winner id present in cluster but absent from
  // rowsById → "winner row missing" branch → outcome="failed".
  it("(F12) winner row missing from rowsById after pickWinner → outcome=failed", async () => {
    // rowsById has id=1 only; cluster carries [1, 2, 3]; pickWinner returns
    // winner=2 (in cluster, but no fetched row). membersOf yields a 1-member
    // list (only id=1 has a row), which would normally be < 2 and skip — so
    // we keep cluster with 2 fetched ids [1, 99] and have pickWinner return
    // 99. Both ids are in cluster; only id=1 is in rowsById. members.length=1
    // → < 2 → "skipped". To exercise the "winner row missing" branch we need
    // members.length >= 2 with a winnerId not in rowsById.
    //
    // Phase 1 returns 3 rows (1, 2, 3); cluster references [1, 2, 99]. So
    // members built from rowsById has 2 entries (1, 2) → length>=2. pickWinner
    // returns winner=99 which IS in cluster — passes inclusion check — but
    // rowsById.get(99) is undefined → "failed".
    const generateCompletion = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 99 }));

    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1), row(2), row(3)],
      clusters: [[1, 2, 99]],
      generateCompletion,
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    expect(summary.clustersFailed).toBe(1);
    expect(summary.clusterAudits).toHaveLength(1);
    expect(summary.clusterAudits[0].outcome).toBe("failed");
    expect(summary.clusterAudits[0].winnerId).toBe(99);
  });

  // F12: members.length < 2 (cluster ids missing from rowsById) → outcome="skipped"
  it("(F12) cluster ids absent from fetched rows → membersOf yields <2 → outcome=skipped", async () => {
    // The cluster references ids 99 and 100, but only id=1 was fetched in
    // Phase 1. membersOf filters out ids without a row, leaving 0 members
    // → members.length < 2 → "skipped".
    const generateCompletion = vi.fn();
    const { deps, mergeCanonicalsMock } = buildDeps({
      rows: [row(1)],
      clusters: [[99, 100]],
      generateCompletion,
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(generateCompletion).not.toHaveBeenCalled();
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
    expect(summary.clusterAudits).toHaveLength(1);
    expect(summary.clusterAudits[0].outcome).toBe("skipped");
  });

  // Fix 8: Phase 3 winner-pick throw → clustersFailed isolation
  it("isolates Phase 3 winner-pick throws to clustersFailed and continues", async () => {
    // Two clusters. Cluster A's winner-pick throws (LLM 500); cluster B
    // succeeds end-to-end. Expected: clustersSeen=2, clustersFailed=1,
    // mergesExecuted=1 (from cluster B), no exception escapes.
    const generateCompletion = vi
      .fn()
      // Cluster A — winner-pick throws
      .mockRejectedValueOnce(new Error("LLM 500"))
      // Cluster B — winner pick + verify
      .mockResolvedValueOnce(JSON.stringify({ winner_id: 3 }))
      .mockResolvedValueOnce(JSON.stringify({ same_entity: true }));

    const { deps, mergeCanonicalsMock, logger } = buildDeps({
      rows: [row(1), row(2), row(3), row(4)],
      clusters: [
        [1, 2],
        [3, 4],
      ],
      generateCompletion,
      // Only cluster B produces affectedWinners → pre(3); Phase 6 batch post(3).
      preCountQueue: [5],
      postBatchRows: [{ id: 3, count: 7 }],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(summary.clustersSeen).toBe(2);
    expect(summary.clustersFailed).toBe(1);
    expect(summary.mergesExecuted).toBe(1);
    expect(summary.mergesFailed).toBe(0);
    expect(mergeCanonicalsMock).toHaveBeenCalledTimes(1);
    expect(mergeCanonicalsMock).toHaveBeenCalledWith({
      loserId: 4,
      winnerId: 3,
      actor: "reconcile-canonicals",
    });
    // Cluster B drift: post(3)=7 − pre(3)=5 = 2.
    expect(summary.episodeCountDrift).toBe(2);

    // F3: cluster-failure warn payload must carry phase, memberIds, winnerId.
    const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
    const clusterFailedCall = warnCalls.find(
      ([msg]) => msg === "reconcile_cluster_failed",
    );
    expect(clusterFailedCall).toBeDefined();
    const payload = clusterFailedCall![1] as Record<string, unknown>;
    // Winner-pick threw before Phase 3 completed → phase="winner_pick", winnerId=null.
    expect(payload.phase).toBe("winner_pick");
    expect(payload.memberIds).toEqual([1, 2]);
    expect(payload.winnerId).toBeNull();
    expect(typeof payload.error).toBe("string");

    // F12: cluster A took the catch path → outcome="failed".
    // Cluster B fully merged → outcome="merged".
    expect(summary.clusterAudits.map((a) => a.outcome)).toEqual([
      "failed",
      "merged",
    ]);
  });

  // F2: malformed embedding rows are dropped, malformedEmbeddingCount increments
  it("(F2) drops rows with NaN-producing string embeddings and increments malformedEmbeddingCount", async () => {
    // Row 1 has a valid embedding; row 2 has a malformed string embedding
    // "[1, abc, 3]" that produces [1, NaN, 3]. Row 2 must be dropped.
    const validRow = row(1, "topic-1", [1, 0, 0]);
    const malformedRow = {
      id: 2,
      label: "topic-2",
      kind: "release" as const,
      summary: "summary-2",
      identity_embedding: "[1, abc, 3]",
    };

    const generateCompletion = vi.fn();
    const { deps, mergeCanonicalsMock, clusterMock } = buildDeps({
      rows: [validRow, malformedRow],
      clusters: [], // no clusters — we only test Phase 1 filtering here
      generateCompletion,
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    // malformedRow must have been dropped.
    expect(summary.malformedEmbeddingCount).toBe(1);
    // The clustering input must only contain the valid row (id=1).
    expect(clusterMock).toHaveBeenCalledOnce();
    const clusterInput = clusterMock.mock.calls[0][0] as Array<{
      id: number;
      embedding: number[];
    }>;
    expect(clusterInput).toHaveLength(1);
    expect(clusterInput[0].id).toBe(1);
    // No merges should have occurred.
    expect(mergeCanonicalsMock).not.toHaveBeenCalled();
  });

  // F2: valid embedding formats pass through with malformedEmbeddingCount=0
  it("(F2) Float32Array, number[], and well-formed string embeddings pass through with malformedEmbeddingCount=0", async () => {
    const float32Row = {
      id: 1,
      label: "topic-1",
      kind: "release" as const,
      summary: "summary-1",
      identity_embedding: new Float32Array([1, 0, 0]),
    };
    const arrayRow = {
      id: 2,
      label: "topic-2",
      kind: "release" as const,
      summary: "summary-2",
      identity_embedding: [0, 1, 0],
    };
    const stringRow = {
      id: 3,
      label: "topic-3",
      kind: "release" as const,
      summary: "summary-3",
      identity_embedding: "[0,0,1]",
    };

    const { deps, clusterMock } = buildDeps({
      rows: [float32Row, arrayRow, stringRow],
      clusters: [],
      decayRows: [],
    });

    const summary = await runReconciliation(deps);

    expect(summary.malformedEmbeddingCount).toBe(0);
    const clusterInput = clusterMock.mock.calls[0][0] as Array<{
      id: number;
      embedding: number[];
    }>;
    expect(clusterInput).toHaveLength(3);
    expect(clusterInput.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

// ─── Phase 1 — fetch SQL ───────────────────────────────────────────────────

/**
 * Fix 7: lock the Phase 1 SELECT shape so a future refactor that drops
 * `WHERE status='active'`, switches `>` to `>=`, hardcodes the lookback days,
 * or omits `identity_embedding` from the SELECT list fails the suite. Mirrors
 * the SQL-text + bound-param assertion style from the Phase 7 decay matrix.
 */
describe("Phase 1 — fetch SQL", () => {
  it("SELECTs id/label/kind/summary/identity_embedding with the active+lookback predicate", async () => {
    // Empty rows → orchestrator hits the early-return path. We only need to
    // capture call[0], the Phase 1 SELECT.
    const { deps, db } = buildDeps({
      rows: [],
      decayRows: [],
    });

    await runReconciliation(deps);

    const { sqlText, params } = serializeSql(db.calls[0]);

    // SELECT list must include every column the orchestrator consumes.
    expect(sqlText).toMatch(/SELECT/i);
    expect(sqlText).toMatch(/\bid\b/);
    expect(sqlText).toMatch(/\blabel\b/);
    expect(sqlText).toMatch(/\bkind\b/);
    expect(sqlText).toMatch(/\bsummary\b/);
    expect(sqlText).toMatch(/identity_embedding/);
    // FROM the canonical_topics table.
    expect(sqlText).toMatch(/FROM\s+canonical_topics/i);
    // WHERE clause guards: status='active' AND last_seen > now() - lookback.
    expect(sqlText).toMatch(/WHERE/i);
    expect(sqlText).toMatch(/status\s*=\s*'active'/i);
    expect(sqlText).toMatch(/last_seen\s*>/);
    expect(sqlText).toMatch(/now\s*\(\s*\)/i);
    // Lookback days bound as a parameter (NOT inlined as a literal).
    expect(params).toContain(RECONCILE_LOOKBACK_DAYS);
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
 * `decayStaleCanonicals` in the DB helper module (`src/trigger/helpers/reconcile-canonicals-db.ts`),
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
      // No merges → no pre-count or Phase 6 batch queries.
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
