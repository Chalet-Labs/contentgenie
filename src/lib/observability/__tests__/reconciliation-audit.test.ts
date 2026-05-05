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
const mockGte = vi.fn((col, val) => ({ gte: [col, val] }));
const mockLte = vi.fn((col, val) => ({ lte: [col, val] }));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({
      toString: () => strings.join("?"),
      as: (alias: string) => ({ alias }),
      vals,
    }),
    { raw: (s: string) => s },
  ),
  and: (...args: unknown[]) => mockAnd(...args),
  gte: (col: unknown, val: unknown) => mockGte(col, val),
  lte: (col: unknown, val: unknown) => mockLte(col, val),
}));

function makeChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "orderBy", "limit"];
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

describe("getReconciliationAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rows in the shape returned by the DB query", async () => {
    const entries = [
      makeEntry({ id: 2, createdAt: new Date("2026-01-05T14:00:00Z") }),
      makeEntry({ id: 1, createdAt: new Date("2026-01-05T12:00:00Z") }),
    ];
    mockSelect.mockReturnValue(makeChain(entries));
    const result = await getReconciliationAuditLog();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(1);
  });

  it("applies gte + lte on createdAt when window is provided", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-07");
    await getReconciliationAuditLog({ start, end });
    expect(mockGte).toHaveBeenCalledWith("created_at", start);
    expect(mockLte).toHaveBeenCalledWith("created_at", end);
    expect(mockAnd).toHaveBeenCalled();
  });

  it("omits where clause when no window is provided", async () => {
    const chain = makeChain([]);
    mockSelect.mockReturnValue(chain);
    await getReconciliationAuditLog();
    // where() should not have been called
    const whereSpy = chain["where"] as ReturnType<typeof vi.fn>;
    expect(whereSpy).not.toHaveBeenCalled();
    expect(mockGte).not.toHaveBeenCalled();
    expect(mockLte).not.toHaveBeenCalled();
  });

  it("respects the limit parameter", async () => {
    const chain = makeChain([]);
    mockSelect.mockReturnValue(chain);
    await getReconciliationAuditLog(undefined, 10);
    const limitSpy = chain["limit"] as ReturnType<typeof vi.fn>;
    expect(limitSpy).toHaveBeenCalledWith(10);
  });

  it("defaults to limit=50 when no limit is provided", async () => {
    const chain = makeChain([]);
    mockSelect.mockReturnValue(chain);
    await getReconciliationAuditLog();
    const limitSpy = chain["limit"] as ReturnType<typeof vi.fn>;
    expect(limitSpy).toHaveBeenCalledWith(50);
  });

  it("returns [] when no rows match the window filter", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-01"),
    };
    const result = await getReconciliationAuditLog(window);
    expect(result).toEqual([]);
  });

  it("returned entries carry all expected audit fields", async () => {
    const entry = makeEntry({
      outcome: "merged",
      winnerId: 42,
      loserIds: [43],
    });
    mockSelect.mockReturnValue(makeChain([entry]));
    const [result] = await getReconciliationAuditLog();
    expect(result.outcome).toBe("merged");
    expect(result.winnerId).toBe(42);
    expect(result.loserIds).toEqual([43]);
    expect(result.clusterSize).toBe(3);
    expect(result.mergesExecuted).toBeDefined();
    expect(result.mergesRejected).toBeDefined();
    expect(result.pairwiseVerifyThrew).toBeDefined();
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});
