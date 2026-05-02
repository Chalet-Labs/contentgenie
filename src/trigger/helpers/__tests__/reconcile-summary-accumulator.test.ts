// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { ReconcileSummary } from "@/trigger/helpers/reconcile-canonicals";
import { ReconcileSummaryAccumulator } from "@/trigger/helpers/reconcile-summary-accumulator";

const EXPECTED_KEYS: Array<keyof ReconcileSummary> = [
  "clustersSeen",
  "clustersFailed",
  "clustersDeferred",
  "malformedEmbeddingCount",
  "clustersSkippedWinnerAlreadyMerged",
  "mergesExecuted",
  "mergesFailed",
  "mergesRejectedByPairwise",
  "mergesSkippedAlreadyMerged",
  "pairwiseVerifyThrew",
  "pairwiseVerifyRejected",
  "dormancyTransitions",
  "episodeCountDrift",
  "durationMs",
];

describe("ReconcileSummaryAccumulator", () => {
  it("freeze(0) returns all-zero shape with every ReconcileSummary key present", () => {
    const accum = new ReconcileSummaryAccumulator();
    const result = accum.freeze(0);

    // Structural check: exactly the expected keys, no extras or missing.
    expect(Object.keys(result).sort()).toEqual([...EXPECTED_KEYS].sort());

    // All counters are zero; durationMs matches the argument.
    for (const key of EXPECTED_KEYS) {
      if (key === "durationMs") {
        expect(result[key]).toBe(0);
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
        if (key === "durationMs") continue;
        const expected = key === field ? 1 : 0;
        expect(
          result[key],
          `${field} method: expected ${key} === ${expected}`,
        ).toBe(expected);
      }
    }
  });

  it("clusterDeferred(N) adds N, not 1", () => {
    const accum = new ReconcileSummaryAccumulator();
    accum.clusterDeferred(7);
    expect(accum.freeze(0).clustersDeferred).toBe(7);

    accum.clusterDeferred(3);
    expect(accum.freeze(0).clustersDeferred).toBe(10);
  });

  it("dormancyTransitioned(N) adds N across multiple calls", () => {
    const accum = new ReconcileSummaryAccumulator();
    accum.dormancyTransitioned(5);
    accum.dormancyTransitioned(2);
    expect(accum.freeze(0).dormancyTransitions).toBe(7);
  });

  it("episodeCountDriftAdded(delta) accumulates across calls", () => {
    const accum = new ReconcileSummaryAccumulator();
    accum.episodeCountDriftAdded(1);
    accum.episodeCountDriftAdded(2);
    expect(accum.freeze(0).episodeCountDrift).toBe(3);
  });

  it("pairwiseVerifyThrew(N) adds N (not 1)", () => {
    const accum = new ReconcileSummaryAccumulator();
    accum.pairwiseVerifyThrew(3);
    expect(accum.freeze(0).pairwiseVerifyThrew).toBe(3);

    accum.pairwiseVerifyThrew(2);
    expect(accum.freeze(0).pairwiseVerifyThrew).toBe(5);
  });

  it("pairwiseVerifyRejected(N) adds N (not 1)", () => {
    const accum = new ReconcileSummaryAccumulator();
    accum.pairwiseVerifyRejected(4);
    expect(accum.freeze(0).pairwiseVerifyRejected).toBe(4);
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
});
