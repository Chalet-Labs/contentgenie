/**
 * Local type declarations for the `density-clustering` (npm, MIT, v1.3.0)
 * package, which ships JavaScript without TypeScript definitions.
 *
 * Only the DBSCAN surface used by `@/lib/reconcile-clustering` is declared.
 * KMEANS, OPTICS, and PriorityQueue are not used by the codebase.
 *
 * See ADR-050 for why DBSCAN (not HDBSCAN) is used.
 */
declare module "density-clustering" {
  export type DistanceFunction = (a: number[], b: number[]) => number;

  export class DBSCAN {
    /** Indices of dataset rows classified as noise after the latest `run()`. */
    noise: number[];
    /**
     * Run DBSCAN over `dataset` (one row per data point).
     *
     * @param dataset Numeric vectors. Distance is computed via `distanceFn`.
     * @param epsilon Neighborhood radius in the metric defined by `distanceFn`.
     * @param minPts Minimum neighbors (including self) required for a core point.
     * @param distanceFn Custom distance function. Defaults to Euclidean.
     * @returns An array of clusters; each inner array contains the dataset indices for one cluster.
     */
    run(
      dataset: number[][],
      epsilon: number,
      minPts: number,
      distanceFn?: DistanceFunction,
    ): number[][];
  }
}
