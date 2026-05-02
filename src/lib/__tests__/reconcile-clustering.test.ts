// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  clusterByIdentityEmbedding,
  cosineDistance,
} from "@/lib/reconcile-clustering";

/**
 * 16-dim fixture vectors keep the suite fast. The cluster helper is exercised
 * at full 1024-dim only by the upstream task tests + the manual integration
 * check called out in the JSDoc on the helper.
 */
const DIM = 16;

function makeVector(values: number[]): number[] {
  // Pad/truncate to DIM so every fixture has the same width.
  const v = values.slice(0, DIM);
  while (v.length < DIM) v.push(0);
  return v;
}

function unitX(): number[] {
  return makeVector([1]);
}

function unitY(): number[] {
  return makeVector([0, 1]);
}

describe("cosineDistance", () => {
  it("returns 0 for a vector compared with itself", () => {
    const v = makeVector([1, 2, 3, 4]);
    expect(cosineDistance(v, v)).toBeCloseTo(0, 12);
  });

  it("returns 2 for a vector compared with its negation", () => {
    const v = makeVector([1, 2, 3, 4]);
    const negV = v.map((x) => -x);
    expect(cosineDistance(v, negV)).toBeCloseTo(2, 12);
  });

  it("returns 1 for orthogonal vectors", () => {
    expect(cosineDistance(unitX(), unitY())).toBeCloseTo(1, 12);
  });

  it("returns approximately 1 - 0.95 for a hand-crafted 0.95-similar pair", () => {
    // Cosine similarity ≈ 0.95 by construction:
    // a = [1, 0], b = [cos(t), sin(t)] with cos(t)=0.95.
    const t = Math.acos(0.95);
    const a = makeVector([1, 0]);
    const b = makeVector([Math.cos(t), Math.sin(t)]);
    expect(cosineDistance(a, b)).toBeCloseTo(0.05, 6);
  });

  it("treats empty / mismatched-length input as 'not similar' (returns 1) without throwing", () => {
    expect(cosineDistance([], [])).toBe(1);
    expect(cosineDistance([1, 2, 3], [1, 2])).toBe(1);
  });

  it("treats a zero-norm input as 'not similar' (returns 1) without dividing by zero", () => {
    const zero = makeVector([0, 0, 0]);
    const v = makeVector([1, 2, 3]);
    expect(cosineDistance(zero, v)).toBe(1);
    expect(cosineDistance(v, zero)).toBe(1);
  });
});

describe("clusterByIdentityEmbedding", () => {
  it("returns no clusters on empty input", () => {
    expect(clusterByIdentityEmbedding([])).toEqual({ clusters: [] });
  });

  it("identifies a 3-vector cluster of near-duplicate embeddings at eps=0.1", () => {
    // Three near-identical vectors — pairwise cosine distance well below 0.1.
    const rows = [
      { id: 1, embedding: makeVector([1, 0.001, 0.002]) },
      { id: 2, embedding: makeVector([1, 0.002, 0.001]) },
      { id: 3, embedding: makeVector([1, 0.0015, 0.0015]) },
    ];
    const { clusters } = clusterByIdentityEmbedding(rows);
    expect(clusters).toHaveLength(1);
    expect([...clusters[0]!].sort()).toEqual([1, 2, 3]);
  });

  it("excludes noise (singletons) at minPoints=2", () => {
    // Two near-duplicate rows + one orthogonal outlier.
    const rows = [
      { id: 10, embedding: makeVector([1, 0.001]) },
      { id: 11, embedding: makeVector([1, 0.002]) },
      { id: 99, embedding: makeVector([0, 1]) },
    ];
    const { clusters } = clusterByIdentityEmbedding(rows);
    expect(clusters).toHaveLength(1);
    expect([...clusters[0]!].sort()).toEqual([10, 11]);
  });

  it("does not cluster vectors that exceed the eps threshold", () => {
    // Two orthogonal vectors — cosine distance = 1, well above eps=0.1.
    const rows = [
      { id: 1, embedding: unitX() },
      { id: 2, embedding: unitY() },
    ];
    const { clusters } = clusterByIdentityEmbedding(rows);
    expect(clusters).toEqual([]);
  });

  it("respects custom eps + minPoints overrides", () => {
    // Two vectors at cosine distance ≈ 0.05; with default eps=0.1 they
    // cluster, but a tightened eps=0.01 must drop them to noise.
    const t = Math.acos(0.95);
    const rows = [
      { id: 1, embedding: makeVector([1, 0]) },
      { id: 2, embedding: makeVector([Math.cos(t), Math.sin(t)]) },
    ];
    expect(clusterByIdentityEmbedding(rows, { eps: 0.01 }).clusters).toEqual(
      [],
    );
    expect(
      clusterByIdentityEmbedding(rows, { eps: 0.1 }).clusters,
    ).toHaveLength(1);
  });

  it("requires minPoints members; a 2-vector cluster is dropped at minPoints=3", () => {
    const rows = [
      { id: 1, embedding: makeVector([1, 0.001]) },
      { id: 2, embedding: makeVector([1, 0.002]) },
    ];
    expect(clusterByIdentityEmbedding(rows, { minPoints: 3 }).clusters).toEqual(
      [],
    );
  });

  it("returns separate clusters for two disjoint dense neighborhoods", () => {
    // Cluster A: near unitX. Cluster B: near unitY. Pairwise cross-cluster
    // distance ≈ 1, intra-cluster distance ≈ 0.
    const rows = [
      { id: 1, embedding: makeVector([1, 0.001]) },
      { id: 2, embedding: makeVector([1, 0.002]) },
      { id: 10, embedding: makeVector([0.001, 1]) },
      { id: 11, embedding: makeVector([0.002, 1]) },
    ];
    const { clusters } = clusterByIdentityEmbedding(rows);
    expect(clusters).toHaveLength(2);
    const sortedClusters = clusters
      .map((c) => [...c].sort((a, b) => a - b))
      .sort((a, b) => a[0]! - b[0]!);
    expect(sortedClusters).toEqual([
      [1, 2],
      [10, 11],
    ]);
  });
});
