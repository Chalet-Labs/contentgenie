import type { ReconcileSummary } from "@/trigger/helpers/reconcile-canonicals";

/**
 * Per-cluster audit data collected during reconciliation (ADR-053 §1).
 * Matches `NewReconciliationLog` minus `id`, `runId`, and `createdAt`
 * (those are added by the DB insertion layer in T3).
 */
export interface ClusterAuditRow {
  clusterIndex: number;
  clusterSize: number;
  winnerId: number | null;
  loserIds: number[];
  verifiedLoserIds: number[];
  rejectedLoserIds: number[];
  mergesExecuted: number;
  mergesRejected: number;
  pairwiseVerifyThrew: number;
  outcome: "merged" | "partial" | "rejected" | "skipped" | "failed";
}

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
    clusterAudits: [],
  };

  recordClusterAudit(row: ClusterAuditRow): void {
    this.state.clusterAudits.push(row);
  }

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
