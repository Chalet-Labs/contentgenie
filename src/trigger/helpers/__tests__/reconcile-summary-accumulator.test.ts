// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { ReconcileSummary } from "@/trigger/helpers/reconcile-canonicals";
import {
  ReconcileSummaryAccumulator,
  type ClusterAuditRow,
} from "@/trigger/helpers/reconcile-summary-accumulator";

// Record<keyof ReconcileSummary, true> forces exhaustiveness at compile time:
// adding a field to ReconcileSummary without updating this object is a TS error.
const EXPECTED_KEYS_RECORD: Record<keyof ReconcileSummary, true> = {
  clustersSeen: true,
  clustersFailed: true,
  clustersDeferred: true,
  malformedEmbeddingCount: true,
  clustersSkippedWinnerAlreadyMerged: true,
  mergesExecuted: true,
  mergesFailed: true,
  mergesRejectedByPairwise: true,
  mergesSkippedAlreadyMerged: true,
  pairwiseVerifyThrew: true,
  pairwiseVerifyRejected: true,
  dormancyTransitions: true,
  episodeCountDrift: true,
  durationMs: true,
  clusterAudits: true,
};
const EXPECTED_KEYS = Object.keys(EXPECTED_KEYS_RECORD) as Array<
  keyof ReconcileSummary
>;

describe("ReconcileSummaryAccumulator", () => {
  it("freeze(0) returns all-zero shape with every ReconcileSummary key present", () => {
    const accum = new ReconcileSummaryAccumulator();
    const result = accum.freeze(0);

    // Structural check: exactly the expected keys, no extras or missing.
    expect(Object.keys(result).sort()).toEqual([...EXPECTED_KEYS].sort());

    // Numeric counters are zero; durationMs matches the argument; clusterAudits is empty.
    for (const key of EXPECTED_KEYS) {
      if (key === "clusterAudits") {
        expect(result[key], "clusterAudits should start empty").toEqual([]);
      } else {
        expect(result[key], `expected ${key} === 0`).toBe(0);
      }
    }
  });

  it("each unit-increment method touches exactly one field", () => {
    const cases: Array<
      [keyof ReconcileSummary, (a: ReconcileSummaryAccumulator) => void]
    > = [
      ["clustersSeen", (a) => a.clusterSeen()],
      ["clustersFailed", (a) => a.clusterFailed()],
      [
        "clustersSkippedWinnerAlreadyMerged",
        (a) => a.clusterSkippedWinnerAlreadyMerged(),
      ],
      ["mergesRejectedByPairwise", (a) => a.clusterRejectedByPairwise()],
      ["mergesExecuted", (a) => a.mergeSucceeded()],
      ["mergesFailed", (a) => a.mergeFailed()],
      ["mergesSkippedAlreadyMerged", (a) => a.mergeSkippedAlreadyMerged()],
      ["malformedEmbeddingCount", (a) => a.malformedEmbeddingDropped()],
    ];

    for (const [field, call] of cases) {
      const accum = new ReconcileSummaryAccumulator();
      call(accum);
      const result = accum.freeze(0);

      for (const key of EXPECTED_KEYS) {
        if (key === "durationMs" || key === "clusterAudits") continue;
        const expected = key === field ? 1 : 0;
        expect(
          result[key],
          `${field} method: expected ${key} === ${expected}`,
        ).toBe(expected);
      }
    }
  });

  it.each<
    [
      string,
      keyof ReconcileSummary,
      (a: ReconcileSummaryAccumulator, n: number) => void,
      number[],
    ]
  >([
    [
      "clusterDeferred",
      "clustersDeferred",
      (a, n) => a.clusterDeferred(n),
      [7, 3],
    ],
    [
      "dormancyTransitioned",
      "dormancyTransitions",
      (a, n) => a.dormancyTransitioned(n),
      [5, 2],
    ],
    [
      "pairwiseVerifyThrew",
      "pairwiseVerifyThrew",
      (a, n) => a.pairwiseVerifyThrew(n),
      [3, 2],
    ],
    [
      "pairwiseVerifyRejected",
      "pairwiseVerifyRejected",
      (a, n) => a.pairwiseVerifyRejected(n),
      [4],
    ],
    [
      "episodeCountDriftAdded",
      "episodeCountDrift",
      (a, n) => a.episodeCountDriftAdded(n),
      [1, 2],
    ],
  ])("%s(N) accumulates across calls", (_, field, call, args) => {
    const accum = new ReconcileSummaryAccumulator();
    for (const n of args) call(accum, n);
    expect(accum.freeze(0)[field]).toBe(args.reduce((a, b) => a + b, 0));
  });

  it("freeze(durationMs) passes through durationMs and does not mutate internal state", () => {
    const accum = new ReconcileSummaryAccumulator();
    accum.clusterSeen();

    const first = accum.freeze(100);
    expect(first.durationMs).toBe(100);
    expect(first.clustersSeen).toBe(1);

    // Second freeze with a different durationMs — internal state must be unchanged.
    const second = accum.freeze(200);
    expect(second.durationMs).toBe(200);
    expect(second.clustersSeen).toBe(1);

    // First result is not mutated by the second freeze call.
    expect(first.durationMs).toBe(100);
  });

  // ─── recordClusterAudit / clusterAudits ────────────────────────────────────

  function makeAudit(
    overrides: Partial<ClusterAuditRow> = {},
  ): ClusterAuditRow {
    return {
      clusterIndex: 0,
      clusterSize: 3,
      winnerId: 1,
      loserIds: [2, 3],
      verifiedLoserIds: [2],
      rejectedLoserIds: [3],
      mergesExecuted: 1,
      mergesRejected: 1,
      pairwiseVerifyThrew: 0,
      outcome: "partial",
      ...overrides,
    };
  }

  it("freeze includes clusterAudits with all recorded rows", () => {
    const accum = new ReconcileSummaryAccumulator();
    const row1 = makeAudit({ clusterIndex: 0, outcome: "merged" });
    const row2 = makeAudit({
      clusterIndex: 1,
      outcome: "skipped",
      winnerId: null,
    });
    accum.recordClusterAudit(row1);
    accum.recordClusterAudit(row2);

    const result = accum.freeze(50);
    expect(result.clusterAudits).toHaveLength(2);
    expect(result.clusterAudits[0]).toEqual(row1);
    expect(result.clusterAudits[1]).toEqual(row2);
  });

  it("clusterAudits.length matches number of recordClusterAudit calls", () => {
    const accum = new ReconcileSummaryAccumulator();
    for (let i = 0; i < 5; i++) {
      accum.recordClusterAudit(makeAudit({ clusterIndex: i }));
    }
    expect(accum.freeze(0).clusterAudits).toHaveLength(5);
  });

  it.each<[ClusterAuditRow["outcome"]]>([
    ["merged"],
    ["partial"],
    ["rejected"],
    ["skipped"],
    ["failed"],
  ])("recordClusterAudit records outcome=%s faithfully", (outcome) => {
    const accum = new ReconcileSummaryAccumulator();
    accum.recordClusterAudit(makeAudit({ outcome }));
    expect(accum.freeze(0).clusterAudits[0].outcome).toBe(outcome);
  });

  it("freeze with no recorded audits returns clusterAudits=[]", () => {
    const accum = new ReconcileSummaryAccumulator();
    accum.clusterSeen();
    expect(accum.freeze(0).clusterAudits).toEqual([]);
  });
});
