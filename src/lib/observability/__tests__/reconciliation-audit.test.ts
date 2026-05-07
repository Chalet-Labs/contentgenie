// @vitest-environment node

/**
 * Unit tests for `getReconciliationAuditLog` (T7 — issue #392).
 *
 * Mocks the @/db boundary using the same makeChain() / vi.mock pattern as
 * resolution-metrics.test.ts. No live DB is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  reconciliationLog: {
    createdAt: "created_at",
    runId: "run_id",
    clusterIndex: "cluster_index",
  },
}));

const mockAnd = vi.fn((...args) => ({ and: args }));
const mockDesc = vi.fn((col) => ({ desc: col }));
const mockCount = vi.fn(() => "COUNT(*)");

// Capture every sql`...` invocation so tests can assert on the timezone-pinned
// filter expression that replaced the old gte/lte helpers.
const sqlCalls: Array<{
  strings: readonly string[];
  vals: unknown[];
}> = [];

vi.mock("drizzle-orm", () => ({
  count: (...args: unknown[]) => mockCount(...(args as [])),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => {
      sqlCalls.push({ strings: [...strings], vals });
      return {
        toString: () => strings.join("?"),
        as: (alias: string) => ({ alias }),
        vals,
      };
    },
    { raw: (s: string) => s },
  ),
  and: (...args: unknown[]) => mockAnd(...args),
  desc: (col: unknown) => mockDesc(col),
}));

function makeChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "orderBy", "limit", "offset"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain["then"] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

import { getReconciliationAuditLog } from "@/lib/observability/reconciliation-audit";

function makeEntry(overrides: Record<string, unknown> = {}) {
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

/**
 * `getReconciliationAuditLog` issues two queries (rows + count). Stub
 * mockSelect to return the rows chain on the first call and a count chain
 * resolving to `[{ value: total }]` on the second.
 */
function stubRowsAndCount(rows: unknown[], total = rows.length) {
  const rowsChain = makeChain(rows);
  const countChain = makeChain([{ value: total }]);
  mockSelect.mockReturnValueOnce(rowsChain).mockReturnValueOnce(countChain);
  return { rowsChain, countChain };
}

describe("getReconciliationAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlCalls.length = 0;
  });

  it("returns rows + total + pagination state", async () => {
    const entries = [
      makeEntry({ id: 2, createdAt: new Date("2026-01-05T14:00:00Z") }),
      makeEntry({ id: 1, createdAt: new Date("2026-01-05T12:00:00Z") }),
    ];
    stubRowsAndCount(entries, 2);
    const result = await getReconciliationAuditLog();
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].id).toBe(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.hasMore).toBe(false);
  });

  it("applies a UTC-pinned time filter when window is provided", async () => {
    stubRowsAndCount([], 0);
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-07");
    await getReconciliationAuditLog({ start, end });

    // The new filter uses `(col AT TIME ZONE 'UTC') >= start` rather than
    // gte/lte helpers. Confirm two raw-sql calls landed with the right values.
    const tzFilters = sqlCalls.filter((c) =>
      c.strings.some((s) => s.includes("AT TIME ZONE 'UTC'")),
    );
    expect(tzFilters).toHaveLength(2);
    expect(tzFilters[0].vals).toContain(start);
    expect(tzFilters[1].vals).toContain(end);
    expect(mockAnd).toHaveBeenCalled();
  });

  it("omits the where clause when no window is provided", async () => {
    const { rowsChain, countChain } = stubRowsAndCount([], 0);
    await getReconciliationAuditLog();
    expect(rowsChain["where"]).not.toHaveBeenCalled();
    expect(countChain["where"]).not.toHaveBeenCalled();
  });

  it("respects an explicit pageSize", async () => {
    const { rowsChain } = stubRowsAndCount([], 0);
    await getReconciliationAuditLog(undefined, 1, 10);
    expect(rowsChain["limit"]).toHaveBeenCalledWith(10);
    expect(rowsChain["offset"]).toHaveBeenCalledWith(0);
  });

  it("defaults to pageSize=50 when not provided", async () => {
    const { rowsChain } = stubRowsAndCount([], 0);
    await getReconciliationAuditLog();
    expect(rowsChain["limit"]).toHaveBeenCalledWith(50);
  });

  it("offsets by (page-1) * pageSize for page > 1", async () => {
    const { rowsChain } = stubRowsAndCount([], 0);
    await getReconciliationAuditLog(undefined, 3, 25);
    expect(rowsChain["offset"]).toHaveBeenCalledWith(50);
  });

  it("clamps page and pageSize to safe minimums", async () => {
    const { rowsChain } = stubRowsAndCount([], 0);
    await getReconciliationAuditLog(undefined, 0, 0);
    expect(rowsChain["limit"]).toHaveBeenCalledWith(1);
    expect(rowsChain["offset"]).toHaveBeenCalledWith(0);
  });

  it("computes hasMore from page * pageSize < total", async () => {
    stubRowsAndCount(
      Array.from({ length: 50 }, (_, i) => makeEntry({ id: i })),
      137,
    );
    const result = await getReconciliationAuditLog(undefined, 2, 50);
    expect(result.total).toBe(137);
    expect(result.hasMore).toBe(true);

    stubRowsAndCount(
      Array.from({ length: 37 }, (_, i) => makeEntry({ id: i })),
      137,
    );
    const last = await getReconciliationAuditLog(undefined, 3, 50);
    expect(last.hasMore).toBe(false);
  });

  it("returns an empty rows array with total=0 when no rows match the window", async () => {
    stubRowsAndCount([], 0);
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-01"),
    };
    const result = await getReconciliationAuditLog(window);
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returned entries carry all expected audit fields", async () => {
    const entry = makeEntry({
      outcome: "merged",
      winnerId: 42,
      loserIds: [43],
    });
    stubRowsAndCount([entry], 1);
    const { rows } = await getReconciliationAuditLog();
    const [first] = rows;
    expect(first.outcome).toBe("merged");
    expect(first.winnerId).toBe(42);
    expect(first.loserIds).toEqual([43]);
    expect(first.clusterSize).toBe(3);
    expect(first.mergesExecuted).toBeDefined();
    expect(first.mergesRejected).toBeDefined();
    expect(first.pairwiseVerifyThrew).toBeDefined();
    expect(first.createdAt).toBeInstanceOf(Date);
  });
});
