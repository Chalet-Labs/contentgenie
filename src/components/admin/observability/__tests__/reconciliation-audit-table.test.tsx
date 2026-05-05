import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReconciliationAuditTable } from "@/components/admin/observability/reconciliation-audit-table";
import type { ReconciliationAuditEntry } from "@/lib/observability/reconciliation-audit";

function makeEntry(
  overrides: Partial<ReconciliationAuditEntry> = {},
): ReconciliationAuditEntry {
  return {
    id: 1,
    runId: "run-abc",
    clusterIndex: 0,
    clusterSize: 3,
    winnerId: 10,
    loserIds: [11, 12],
    verifiedLoserIds: [11],
    rejectedLoserIds: [12],
    mergesExecuted: 1,
    mergesRejected: 1,
    pairwiseVerifyThrew: 0,
    outcome: "partial",
    createdAt: new Date("2026-01-05T12:00:00Z"),
    ...overrides,
  };
}

describe("ReconciliationAuditTable", () => {
  it("renders column headers", () => {
    render(<ReconciliationAuditTable entries={[makeEntry()]} />);
    expect(screen.getByText("Timestamp")).toBeInTheDocument();
    expect(screen.getByText("Cluster")).toBeInTheDocument();
    expect(screen.getByText("Size")).toBeInTheDocument();
    expect(screen.getByText("Winner")).toBeInTheDocument();
    expect(screen.getByText("Outcome")).toBeInTheDocument();
  });

  it("renders cluster index as #N", () => {
    render(
      <ReconciliationAuditTable entries={[makeEntry({ clusterIndex: 5 })]} />,
    );
    expect(screen.getByText("#5")).toBeInTheDocument();
  });

  it("renders cluster size", () => {
    render(
      <ReconciliationAuditTable entries={[makeEntry({ clusterSize: 7 })]} />,
    );
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders winner id when present", () => {
    render(
      <ReconciliationAuditTable entries={[makeEntry({ winnerId: 42 })]} />,
    );
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders em dash when winner is null", () => {
    render(
      <ReconciliationAuditTable entries={[makeEntry({ winnerId: null })]} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders outcome badge text", () => {
    render(
      <ReconciliationAuditTable entries={[makeEntry({ outcome: "merged" })]} />,
    );
    expect(screen.getByText("merged")).toBeInTheDocument();
  });

  it.each<ReconciliationAuditEntry["outcome"]>([
    "merged",
    "partial",
    "rejected",
    "skipped",
    "failed",
  ])("renders outcome=%s badge", (outcome) => {
    render(<ReconciliationAuditTable entries={[makeEntry({ outcome })]} />);
    expect(screen.getByText(outcome)).toBeInTheDocument();
  });

  it("shows empty state row when entries is empty", () => {
    render(<ReconciliationAuditTable entries={[]} />);
    expect(
      screen.getByText("No reconciliation activity in this window."),
    ).toBeInTheDocument();
  });

  it("still renders headers in empty state", () => {
    render(<ReconciliationAuditTable entries={[]} />);
    expect(screen.getByText("Outcome")).toBeInTheDocument();
  });

  it("renders one row per entry", () => {
    const entries = [
      makeEntry({ id: 1, clusterIndex: 0, outcome: "merged" }),
      makeEntry({ id: 2, clusterIndex: 1, outcome: "failed" }),
      makeEntry({ id: 3, clusterIndex: 2, outcome: "skipped" }),
    ];
    render(<ReconciliationAuditTable entries={entries} />);
    expect(screen.getByText("#0")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("renders verified/rejected loser counts", () => {
    render(
      <ReconciliationAuditTable
        entries={[
          makeEntry({ verifiedLoserIds: [11, 12], rejectedLoserIds: [13] }),
        ]}
      />,
    );
    // verified count
    expect(screen.getByText("2")).toBeInTheDocument();
    // rejected count
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
