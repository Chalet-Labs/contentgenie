import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ReconciliationAuditTable } from "@/components/admin/observability/reconciliation-audit-table";
import type { ReconciliationAuditEntry } from "@/lib/observability/reconciliation-audit";

function makeEntry(
  overrides: Partial<ReconciliationAuditEntry> = {},
): ReconciliationAuditEntry {
  return {
    id: 1,
    runId: "run-abc123",
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
    createdAt: new Date(Date.now() - 5 * 60 * 1000),
    ...overrides,
  };
}

const allOutcomes: ReconciliationAuditEntry[] = [
  makeEntry({
    id: 1,
    clusterIndex: 0,
    outcome: "merged",
    verifiedLoserIds: [11, 12],
    rejectedLoserIds: [],
    mergesExecuted: 2,
    mergesRejected: 0,
    createdAt: new Date(Date.now() - 2 * 60 * 1000),
  }),
  makeEntry({
    id: 2,
    clusterIndex: 1,
    outcome: "partial",
    createdAt: new Date(Date.now() - 8 * 60 * 1000),
  }),
  makeEntry({
    id: 3,
    clusterIndex: 2,
    outcome: "rejected",
    verifiedLoserIds: [],
    rejectedLoserIds: [11, 12],
    mergesExecuted: 0,
    mergesRejected: 2,
    createdAt: new Date(Date.now() - 15 * 60 * 1000),
  }),
  makeEntry({
    id: 4,
    clusterIndex: 3,
    outcome: "skipped",
    winnerId: null,
    loserIds: [],
    verifiedLoserIds: [],
    rejectedLoserIds: [],
    mergesExecuted: 0,
    mergesRejected: 0,
    clusterSize: 1,
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
  }),
  makeEntry({
    id: 5,
    clusterIndex: 4,
    outcome: "failed",
    winnerId: null,
    verifiedLoserIds: [],
    rejectedLoserIds: [],
    mergesExecuted: 0,
    mergesRejected: 0,
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
  }),
];

const defaultPaginationArgs = {
  page: 1,
  pageSize: 50,
  hasMore: false,
  pageHref: (p: number) => `?auditPage=${p}`,
};

const meta: Meta<typeof ReconciliationAuditTable> = {
  title: "Admin/Observability/ReconciliationAuditTable",
  component: ReconciliationAuditTable,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof ReconciliationAuditTable>;

export const AllOutcomes: Story = {
  args: {
    entries: allOutcomes,
    total: allOutcomes.length,
    ...defaultPaginationArgs,
  },
};

export const SingleMerged: Story = {
  args: {
    entries: [
      makeEntry({
        outcome: "merged",
        verifiedLoserIds: [11, 12],
        rejectedLoserIds: [],
        mergesExecuted: 2,
        mergesRejected: 0,
      }),
    ],
    total: 1,
    ...defaultPaginationArgs,
  },
};

export const Empty: Story = {
  args: { entries: [], total: 0, ...defaultPaginationArgs },
};

export const WithPagination: Story = {
  args: {
    entries: allOutcomes,
    total: 137,
    page: 2,
    pageSize: 50,
    hasMore: true,
    pageHref: (p: number) => `?auditPage=${p}`,
  },
};
