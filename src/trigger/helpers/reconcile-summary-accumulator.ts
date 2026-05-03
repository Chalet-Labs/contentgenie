import type { ReconcileSummary } from "@/trigger/helpers/reconcile-canonicals";

type State = Omit<ReconcileSummary, "durationMs">;

export class ReconcileSummaryAccumulator {
  private state: State = {
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
  };

  clusterSeen(): void {
    this.state.clustersSeen++;
  }
  clusterFailed(): void {
    this.state.clustersFailed++;
  }
  clusterDeferred(remaining: number): void {
    this.state.clustersDeferred += remaining;
  }
  clusterSkippedWinnerAlreadyMerged(): void {
    this.state.clustersSkippedWinnerAlreadyMerged++;
  }
  clusterRejectedByPairwise(): void {
    this.state.mergesRejectedByPairwise++;
  }
  mergeSucceeded(): void {
    this.state.mergesExecuted++;
  }
  mergeFailed(): void {
    this.state.mergesFailed++;
  }
  mergeSkippedAlreadyMerged(): void {
    this.state.mergesSkippedAlreadyMerged++;
  }
  pairwiseVerifyThrew(count: number): void {
    this.state.pairwiseVerifyThrew += count;
  }
  pairwiseVerifyRejected(count: number): void {
    this.state.pairwiseVerifyRejected += count;
  }
  malformedEmbeddingDropped(): void {
    this.state.malformedEmbeddingCount++;
  }
  dormancyTransitioned(count: number): void {
    this.state.dormancyTransitions += count;
  }
  episodeCountDriftAdded(delta: number): void {
    this.state.episodeCountDrift += delta;
  }

  freeze(durationMs: number): ReconcileSummary {
    return { ...this.state, durationMs };
  }
}
