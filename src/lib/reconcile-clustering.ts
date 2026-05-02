/**
 * DBSCAN-over-cosine clustering helper for the nightly canonical-topic
 * reconciliation Trigger.dev task (issue #389).
 *
 * The clustering role here is *candidate generation* only — the LLM (winner-
 * pick + pairwise-verify, see `@/lib/prompts/reconcile-*`) is the actual
 * decision-maker. DBSCAN's flat-density assumption is fine because Phase 1's
 * `status='active' AND last_seen > now() - 30d` filter bounds the input to a
 * homogeneous neighborhood. HDBSCAN was rejected — see ADR-050 §1 for why
 * (npm only ships unmaintained / GPL alpha implementations, the LLM
 * second-passes anyway).
 *
 * Pure module: no IO, no DB, no LLM. Library-agnostic input/output contract
 * (`{ id, embedding }[] → number[][]`) so the implementation can be swapped
 * if `density-clustering` ever breaks.
 */

import { DBSCAN, type DistanceFunction } from "density-clustering";

import {
  RECONCILE_DBSCAN_EPS,
  RECONCILE_DBSCAN_MIN_POINTS,
} from "@/lib/reconcile-constants";

export interface ClusterRow {
  id: number;
  embedding: number[];
}

export interface ClusterOptions {
  /** Cosine-distance ceiling for two rows to be DBSCAN neighbors. */
  eps?: number;
  /** Minimum cluster size; singleton clusters are dropped. */
  minPoints?: number;
}

export interface ClusterResult {
  /** Each inner array is the row ids that belong to one multi-member cluster. */
  clusters: number[][];
}

/**
 * Cosine distance: `1 - cos(a, b)`.
 *
 * Range is `[0, 2]`: `dist(v, v) === 0`, `dist(v, -v) === 2`. Norms are
 * computed inline because the `pplx-embed-v1-0.6b` write path does not
 * guarantee unit-normalized vectors — silently substituting Euclidean would
 * make every "epsilon" knob meaningless. Tests lock this orientation
 * explicitly so a future "let's just use Euclidean" refactor cannot pass.
 */
export function cosineDistance(a: number[], b: number[]): number {
  const len = a.length;
  if (len === 0 || len !== b.length) {
    return 1; // Treat malformed input as "not similar"; do not throw inside DBSCAN.
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) {
    return 1;
  }
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Cluster the input rows by their identity embeddings using DBSCAN with a
 * cosine distance function. Drops noise points and singleton clusters; only
 * multi-member clusters are returned (the LLM judge requires ≥2 members).
 *
 * Empty input returns `{ clusters: [] }` — DBSCAN over zero rows is a no-op.
 */
export function clusterByIdentityEmbedding(
  rows: readonly ClusterRow[],
  opts: ClusterOptions = {},
): ClusterResult {
  if (rows.length === 0) {
    return { clusters: [] };
  }

  const eps = opts.eps ?? RECONCILE_DBSCAN_EPS;
  const minPoints = opts.minPoints ?? RECONCILE_DBSCAN_MIN_POINTS;

  const dataset = rows.map((r) => r.embedding);
  const distance: DistanceFunction = cosineDistance;

  const dbscan = new DBSCAN();
  const indexClusters = dbscan.run(dataset, eps, minPoints, distance);

  // density-clustering returns clusters as arrays of dataset indices and
  // surfaces noise on `dbscan.noise`. We drop noise (already excluded from
  // the cluster array) and any cluster with fewer than `minPoints` members
  // — the latter is a defensive belt-and-braces in case the library returns
  // a sub-`minPoints` cluster under a custom distance function.
  const clusters: number[][] = [];
  for (const indices of indexClusters) {
    if (indices.length < minPoints) continue;
    const ids: number[] = [];
    for (const idx of indices) {
      const row = rows[idx];
      if (row) ids.push(row.id);
    }
    if (ids.length >= minPoints) clusters.push(ids);
  }

  return { clusters };
}
