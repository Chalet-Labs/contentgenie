// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockExecute = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  episodeCanonicalTopics: {
    matchMethod: "match_method",
    similarityToTopMatch: "similarity_to_top_match",
    versionTokenForcedDisambig: "version_token_forced_disambig",
    createdAt: "created_at",
  },
}));

const mockAnd = vi.fn((...args) => ({ and: args }));
const mockGte = vi.fn((col, val) => ({ gte: [col, val] }));
const mockLte = vi.fn((col, val) => ({ lte: [col, val] }));
const mockEq = vi.fn((col, val) => ({ eq: [col, val] }));
const mockIsNotNull = vi.fn((col) => ({ isNotNull: col }));
const mockCount = vi.fn(() => "COUNT(*)");

vi.mock("drizzle-orm", () => ({
  count: (...args: unknown[]) => mockCount(...(args as [])),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({
      mapWith: (fn: (v: unknown) => unknown) => ({
        mapWithFn: fn,
        strings,
        vals,
        as: (alias: string) => ({ alias }),
      }),
      as: (alias: string) => ({ sql: strings.join("?"), alias }),
      toString: () => strings.join("?"),
    }),
    { raw: (s: string) => s },
  ),
  and: (...args: unknown[]) => mockAnd(...args),
  gte: (col: unknown, val: unknown) => mockGte(col, val),
  lte: (col: unknown, val: unknown) => mockLte(col, val),
  eq: (col: unknown, val: unknown) => mockEq(col, val),
  isNotNull: (col: unknown) => mockIsNotNull(col),
}));

vi.mock("@/lib/entity-resolution-constants", () => ({
  MATCH_METHODS: ["auto", "llm_disambig", "new"],
}));

vi.mock("@/lib/search-params/admin-topics-observability", () => ({
  WINDOW_KEYS: ["today", "7d", "30d"],
}));

function makeChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "groupBy", "orderBy", "limit"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain["then"] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

import {
  recordResolutionMetric,
  getMatchMethodHistogram,
  getSimilarityHistogram,
  getDisambigForcedCount,
  windowFromKey,
} from "@/lib/observability/resolution-metrics";

describe("recordResolutionMetric", () => {
  it("resolves to undefined and performs no DB writes", async () => {
    const result = await recordResolutionMetric(
      {} as Parameters<typeof recordResolutionMetric>[0],
    );
    expect(result).toBeUndefined();
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe("getMatchMethodHistogram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("zero-fills missing keys — only auto returned from DB", async () => {
    mockSelect.mockReturnValue(makeChain([{ matchMethod: "auto", count: 5 }]));
    const result = await getMatchMethodHistogram();
    expect(result.auto).toBe(5);
    expect(result.llm_disambig).toBe(0);
    expect(result.new).toBe(0);
  });

  it("zero-fills all keys when no rows returned", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const result = await getMatchMethodHistogram();
    expect(result).toEqual({ auto: 0, llm_disambig: 0, new: 0 });
  });

  it("omits where clause when no window provided", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    await getMatchMethodHistogram();
    expect(mockGte).not.toHaveBeenCalled();
    expect(mockLte).not.toHaveBeenCalled();
  });

  it("passes gte + lte on createdAt when window provided", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-07");
    await getMatchMethodHistogram({ start, end });
    expect(mockGte).toHaveBeenCalledWith("created_at", start);
    expect(mockLte).toHaveBeenCalledWith("created_at", end);
    expect(mockAnd).toHaveBeenCalled();
  });

  it("returns all three keys with correct counts when DB has all", async () => {
    mockSelect.mockReturnValue(
      makeChain([
        { matchMethod: "auto", count: 10 },
        { matchMethod: "llm_disambig", count: 3 },
        { matchMethod: "new", count: 7 },
      ]),
    );
    const result = await getMatchMethodHistogram();
    expect(result).toEqual({ auto: 10, llm_disambig: 3, new: 7 });
  });
});

describe("getSimilarityHistogram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns bucket-count rows mapped to { bucket, count } shape", async () => {
    mockSelect.mockReturnValue(makeChain([{ bucket: 0.85, count: 12 }]));
    const result = await getSimilarityHistogram();
    expect(result.length).toBeGreaterThan(0);
    const entry = result.find((r) => Math.abs(r.bucket - 0.85) < 0.001);
    expect(entry).toBeDefined();
    expect(entry?.count).toBe(12);
  });

  it("calls isNotNull on similarityToTopMatch to filter null rows", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    await getSimilarityHistogram();
    expect(mockIsNotNull).toHaveBeenCalledWith("similarity_to_top_match");
  });

  it("zero-fills missing buckets — returns exactly 20 entries for default bucketSize 0.05", async () => {
    mockSelect.mockReturnValue(makeChain([{ bucket: 0.9, count: 5 }]));
    const result = await getSimilarityHistogram();
    expect(result).toHaveLength(20);
    expect(result.every((r) => typeof r.bucket === "number")).toBe(true);
    expect(result.every((r) => typeof r.count === "number")).toBe(true);
  });

  it("buckets are sorted ascending", async () => {
    mockSelect.mockReturnValue(
      makeChain([
        { bucket: 0.5, count: 3 },
        { bucket: 0.1, count: 7 },
      ]),
    );
    const result = await getSimilarityHistogram();
    for (let i = 1; i < result.length; i++) {
      expect(result[i].bucket).toBeGreaterThanOrEqual(result[i - 1].bucket);
    }
  });

  it("zero-filled missing buckets have count 0", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const result = await getSimilarityHistogram();
    expect(result).toHaveLength(20);
    expect(result.every((r) => r.count === 0)).toBe(true);
  });

  it("similarity=1.0 rows are folded into the 0.95 bucket", async () => {
    // DB returns a row with bucket=1.0 (exact-lookup hit, EXACT_MATCH_SIMILARITY=1.0)
    // The least() cap collapses it into 0.95 before reaching our code.
    // Simulate what the DB returns after the least() expression: bucket=0.95.
    mockSelect.mockReturnValue(makeChain([{ bucket: 0.95, count: 5 }]));
    const result = await getSimilarityHistogram();
    expect(result).toHaveLength(20);
    const bucket95 = result.find((b) => Math.abs(b.bucket - 0.95) < 0.001);
    expect(bucket95).toBeDefined();
    expect(bucket95!.count).toBe(5);
  });
});

describe("getDisambigForcedCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { versionTokenForced, total } from a single aggregate query", async () => {
    mockExecute.mockResolvedValue({
      rows: [{ total: 100, forced: 12 }],
    });
    const result = await getDisambigForcedCount();
    expect(result.total).toBe(100);
    expect(result.versionTokenForced).toBe(12);
  });

  it("returns zeros when no rows in the junction", async () => {
    mockExecute.mockResolvedValue({
      rows: [{ total: 0, forced: 0 }],
    });
    const result = await getDisambigForcedCount();
    expect(result.total).toBe(0);
    expect(result.versionTokenForced).toBe(0);
  });
});

describe("windowFromKey", () => {
  it("'today' anchors start to UTC midnight, end is now", () => {
    const before = Date.now();
    const { start, end } = windowFromKey("today");
    const after = Date.now();

    expect(end.getTime()).toBeGreaterThanOrEqual(before);
    expect(end.getTime()).toBeLessThanOrEqual(after + 1);

    // start must be UTC midnight today
    expect(start.getUTCHours()).toBe(0);
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCSeconds()).toBe(0);
    expect(start.getUTCMilliseconds()).toBe(0);

    // start is today (same UTC date as end)
    expect(start.getUTCFullYear()).toBe(end.getUTCFullYear());
    expect(start.getUTCMonth()).toBe(end.getUTCMonth());
    expect(start.getUTCDate()).toBe(end.getUTCDate());
  });

  it("returns 7-day window for '7d'", () => {
    const { start, end } = windowFromKey("7d");
    const diffMs = end.getTime() - start.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
    expect(diffMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 1000);
  });

  it("returns 30-day window for '30d'", () => {
    const { start, end } = windowFromKey("30d");
    const diffMs = end.getTime() - start.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
    expect(diffMs).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 1000);
  });
});
