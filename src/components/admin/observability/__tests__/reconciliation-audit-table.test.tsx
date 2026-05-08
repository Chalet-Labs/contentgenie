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

function renderTable(
  entries: ReconciliationAuditEntry[],
  overrides: Partial<{
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  }> = {},
) {
  const page = overrides.page ?? 1;
  const pageSize = overrides.pageSize ?? 50;
  const total = overrides.total ?? entries.length;
  const hasMore = overrides.hasMore ?? false;
  return render(
    <ReconciliationAuditTable
      entries={entries}
      page={page}
      pageSize={pageSize}
      total={total}
      hasMore={hasMore}
      pageHref={(p) => `?auditPage=${p}`}
    />,
  );
}

describe("ReconciliationAuditTable", () => {
  it("renders column headers", () => {
    renderTable([makeEntry()]);
    expect(screen.getByText("Timestamp")).toBeInTheDocument();
    expect(screen.getByText("Cluster")).toBeInTheDocument();
    expect(screen.getByText("Size")).toBeInTheDocument();
    expect(screen.getByText("Winner")).toBeInTheDocument();
    expect(screen.getByText("Outcome")).toBeInTheDocument();
  });

  it("renders cluster index as #N", () => {
    renderTable([makeEntry({ clusterIndex: 5 })]);
    expect(screen.getByText("#5")).toBeInTheDocument();
  });

  it("renders cluster size", () => {
    renderTable([makeEntry({ clusterSize: 7 })]);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders winner id when present", () => {
    renderTable([makeEntry({ winnerId: 42 })]);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders em dash when winner is null", () => {
    renderTable([makeEntry({ winnerId: null })]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders outcome badge text", () => {
    renderTable([makeEntry({ outcome: "merged" })]);
    expect(screen.getByText("merged")).toBeInTheDocument();
  });

  it.each<ReconciliationAuditEntry["outcome"]>([
    "merged",
    "partial",
    "rejected",
    "skipped",
    "failed",
  ])("renders outcome=%s badge", (outcome) => {
    renderTable([makeEntry({ outcome })]);
    expect(screen.getByText(outcome)).toBeInTheDocument();
  });

  it("shows empty state row when entries is empty", () => {
    renderTable([]);
    expect(
      screen.getByText("No reconciliation activity in this window."),
    ).toBeInTheDocument();
  });

  it("still renders headers in empty state", () => {
    renderTable([]);
    expect(screen.getByText("Outcome")).toBeInTheDocument();
  });

  it("renders one row per entry", () => {
    const entries = [
      makeEntry({ id: 1, clusterIndex: 0, outcome: "merged" }),
      makeEntry({ id: 2, clusterIndex: 1, outcome: "failed" }),
      makeEntry({ id: 3, clusterIndex: 2, outcome: "skipped" }),
    ];
    renderTable(entries);
    expect(screen.getByText("#0")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("renders verified/rejected loser counts", () => {
    renderTable([
      makeEntry({ verifiedLoserIds: [11, 12], rejectedLoserIds: [13] }),
    ]);
    // verified count
    expect(screen.getByText("2")).toBeInTheDocument();
    // rejected count
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("surfaces the verified and rejected loser IDs (issue #392 AC)", () => {
    renderTable([
      makeEntry({ verifiedLoserIds: [101, 102], rejectedLoserIds: [103] }),
    ]);
    expect(screen.getByText("verified:")).toBeInTheDocument();
    expect(screen.getByText("101, 102")).toBeInTheDocument();
    expect(screen.getByText("rejected:")).toBeInTheDocument();
    expect(screen.getByText("103")).toBeInTheDocument();
  });

  it("omits ID lines when neither verified nor rejected losers exist", () => {
    renderTable([makeEntry({ verifiedLoserIds: [], rejectedLoserIds: [] })]);
    expect(screen.queryByText("verified:")).not.toBeInTheDocument();
    expect(screen.queryByText("rejected:")).not.toBeInTheDocument();
  });

  it("surfaces pairwiseVerifyThrew in the Merges cell when > 0", () => {
    // mergesRejected excludes verify-throws but rejectedLoserIds includes
    // them — the inline 'threw' annotation lets operators reconcile the math.
    renderTable([
      makeEntry({
        mergesExecuted: 1,
        mergesRejected: 1,
        pairwiseVerifyThrew: 2,
      }),
    ]);
    expect(screen.getByText("+2 threw")).toBeInTheDocument();
  });

  it("hides the 'threw' annotation when pairwiseVerifyThrew is 0", () => {
    renderTable([makeEntry({ pairwiseVerifyThrew: 0 })]);
    expect(screen.queryByText(/threw/)).not.toBeInTheDocument();
  });

  it("renders pagination controls with the current range and total", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: i, clusterIndex: i }),
    );
    renderTable(entries, { page: 2, pageSize: 10, total: 25, hasMore: true });
    expect(screen.getByText("11–20 of 25")).toBeInTheDocument();
    const prev = screen.getByRole("link", { name: "Prev" });
    const next = screen.getByRole("link", { name: "Next" });
    expect(prev.getAttribute("href")).toBe("?auditPage=1");
    expect(next.getAttribute("href")).toBe("?auditPage=3");
  });

  it("disables Prev on page 1 and Next when no more pages", () => {
    renderTable([makeEntry()], { page: 1, total: 1, hasMore: false });
    expect(screen.getByRole("link", { name: "Prev" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
