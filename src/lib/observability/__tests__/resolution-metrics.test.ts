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
    updatedAt: "updated_at",
  },
}));

const mockAnd = vi.fn((...args) => ({ and: args }));
const mockGte = vi.fn((col, val) => ({ gte: [col, val] }));
const mockLte = vi.fn((col, val) => ({ lte: [col, val] }));
const mockEq = vi.fn((col, val) => ({ eq: [col, val] }));
const mockIsNotNull = vi.fn((col) => ({ isNotNull: col }));
const mockCount = vi.fn(() => ({
  mapWith: (_fn: (v: unknown) => unknown) => "COUNT(*)",
}));

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
  WINDOW_KEYS: ["24h", "7d", "30d"],
  GRANULARITY_KEYS: ["day", "week"],
}));

// Mocked constants so drift tests pin behavior independent of operator tuning
vi.mock("@/lib/observability/drift-thresholds", () => ({
  DRIFT_AUTO_RATE_FLOOR: 0.4,
  DRIFT_AUTO_RATE_WARN: 0.55,
  DRIFT_DISAMBIG_RATE_CEILING: 0.4,
  DRIFT_DISAMBIG_RATE_WARN: 0.3,
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
  getMatchMethodTrend,
  getSimilarityTrend,
  detectThresholdDrift,
} from "@/lib/observability/resolution-metrics";

describe("recordResolutionMetric", () => {
  it("resolves to undefined and performs no DB writes", async () => {
    const result = await recordResolutionMetric(
      {} as Parameters<typeof recordResolutionMetric>[0],
    );
    expect(result).toBeUndefined();
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
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

  it("passes gte + lte on updatedAt when window provided", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-07");
    await getMatchMethodHistogram({ start, end });
    expect(mockGte).toHaveBeenCalledWith("updated_at", start);
    expect(mockLte).toHaveBeenCalledWith("updated_at", end);
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

  it.each([0, -0.05, NaN, Infinity, 1.1])(
    "throws RangeError for invalid bucketSize=%s",
    async (bad) => {
      await expect(getSimilarityHistogram(undefined, bad)).rejects.toThrow(
        RangeError,
      );
    },
  );

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
    mockSelect.mockReturnValue(makeChain([{ total: 100, forced: 12 }]));
    const result = await getDisambigForcedCount();
    expect(result.total).toBe(100);
    expect(result.versionTokenForced).toBe(12);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns zeros when no rows in the junction", async () => {
    mockSelect.mockReturnValue(makeChain([{ total: 0, forced: 0 }]));
    const result = await getDisambigForcedCount();
    expect(result.total).toBe(0);
    expect(result.versionTokenForced).toBe(0);
  });

  it("passes gte + lte on updatedAt when window provided", async () => {
    mockSelect.mockReturnValue(makeChain([{ total: 5, forced: 2 }]));
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-07");
    await getDisambigForcedCount({ start, end });
    expect(mockGte).toHaveBeenCalledWith("updated_at", start);
    expect(mockLte).toHaveBeenCalledWith("updated_at", end);
    expect(mockAnd).toHaveBeenCalled();
  });

  it("omits where clause when no window provided", async () => {
    mockSelect.mockReturnValue(makeChain([{ total: 0, forced: 0 }]));
    await getDisambigForcedCount();
    expect(mockGte).not.toHaveBeenCalled();
    expect(mockLte).not.toHaveBeenCalled();
  });
});

describe("windowFromKey", () => {
  it("returns 24-hour rolling window for '24h'", () => {
    const { start, end } = windowFromKey("24h");
    const diffMs = end.getTime() - start.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
    expect(diffMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
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

describe("getMatchMethodTrend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one entry per day bucket with auto/llm_disambig/new/total fields", async () => {
    mockSelect.mockReturnValue(
      makeChain([
        { bucket: new Date("2026-01-01"), matchMethod: "auto", count: 8 },
        {
          bucket: new Date("2026-01-01"),
          matchMethod: "llm_disambig",
          count: 2,
        },
        { bucket: new Date("2026-01-02"), matchMethod: "auto", count: 5 },
      ]),
    );
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-02"),
    };
    const result = await getMatchMethodTrend(window, "day");
    expect(Array.isArray(result)).toBe(true);
    const jan1 = result.find((r) =>
      r.bucket.toISOString().startsWith("2026-01-01"),
    );
    expect(jan1).toBeDefined();
    expect(jan1?.auto).toBe(8);
    expect(jan1?.llm_disambig).toBe(2);
    expect(jan1?.total).toBe(10);
  });

  it("zero-fills missing day buckets within the window", async () => {
    mockSelect.mockReturnValue(
      makeChain([
        { bucket: new Date("2026-01-01"), matchMethod: "auto", count: 3 },
      ]),
    );
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-03"),
    };
    const result = await getMatchMethodTrend(window, "day");
    expect(Array.isArray(result)).toBe(true);
    // All entries must have numeric fields
    result.forEach((entry) => {
      expect(typeof entry.auto).toBe("number");
      expect(typeof entry.llm_disambig).toBe("number");
      expect(typeof entry.new).toBe("number");
      expect(typeof entry.total).toBe("number");
    });
    // A zero-filled bucket has total = 0
    const zeroBuckets = result.filter((r) => r.total === 0);
    expect(zeroBuckets.length).toBeGreaterThan(0);
  });

  it("returns week-granularity buckets for granularity=week", async () => {
    mockSelect.mockReturnValue(
      makeChain([
        { bucket: new Date("2025-12-29"), matchMethod: "auto", count: 20 },
        { bucket: new Date("2026-01-05"), matchMethod: "auto", count: 15 },
      ]),
    );
    const window = {
      start: new Date("2025-12-29"),
      end: new Date("2026-01-11"),
    };
    const result = await getMatchMethodTrend(window, "week");
    expect(Array.isArray(result)).toBe(true);
    result.forEach((entry) => {
      expect(entry).toHaveProperty("bucket");
      expect(entry).toHaveProperty("auto");
      expect(entry).toHaveProperty("llm_disambig");
      expect(entry).toHaveProperty("new");
      expect(entry).toHaveProperty("total");
    });
  });

  it("aligns week buckets to Monday even when window.start is not a Monday (B1 regression)", async () => {
    // 2026-04-05 is a Sunday. Postgres date_trunc('week') returns the preceding
    // Monday 2026-04-06. Without the Monday-snap fix, generateBucketRange would
    // produce Sunday keys that never match the DB's Monday keys → all-zero output.
    const mondayKey = new Date("2026-04-06T00:00:00.000Z");
    mockSelect.mockReturnValue(
      makeChain([
        { bucket: mondayKey, matchMethod: "auto", count: 7 },
        { bucket: mondayKey, matchMethod: "llm_disambig", count: 3 },
      ]),
    );
    const window = {
      start: new Date("2026-04-05"), // Sunday — intentionally not Monday
      end: new Date("2026-04-12"),
    };
    const result = await getMatchMethodTrend(window, "week");

    // The entry whose bucket aligns to Monday 2026-04-06 must carry the DB counts.
    const mondayEntry = result.find(
      (r) => r.bucket.toISOString() === mondayKey.toISOString(),
    );
    expect(mondayEntry).toBeDefined();
    expect(mondayEntry!.auto).toBe(7);
    expect(mondayEntry!.llm_disambig).toBe(3);
    expect(mondayEntry!.total).toBe(10);
    // No entry should be a Sunday — all buckets must be Mondays (getUTCDay() === 1)
    result.forEach((entry) => {
      expect(entry.bucket.getUTCDay()).toBe(1);
    });
  });

  it("passes gte + lte on updatedAt when window provided", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-07");
    await getMatchMethodTrend({ start, end }, "day");
    expect(mockGte).toHaveBeenCalledWith("updated_at", start);
    expect(mockLte).toHaveBeenCalledWith("updated_at", end);
    expect(mockAnd).toHaveBeenCalled();
  });

  it("returns an array (possibly empty or zero-filled) when no data in window", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-01"),
    };
    const result = await getMatchMethodTrend(window, "day");
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("getSimilarityTrend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one entry per time bucket, each with a buckets array", async () => {
    mockSelect.mockReturnValue(
      makeChain([
        { bucket: new Date("2026-01-01"), similarityBucket: 0.85, count: 4 },
        { bucket: new Date("2026-01-01"), similarityBucket: 0.95, count: 2 },
        { bucket: new Date("2026-01-02"), similarityBucket: 0.75, count: 6 },
      ]),
    );
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-02"),
    };
    const result = await getSimilarityTrend(window, "day");
    expect(Array.isArray(result)).toBe(true);
    const jan1 = result.find((r) =>
      r.bucket.toISOString().startsWith("2026-01-01"),
    );
    expect(jan1).toBeDefined();
    expect(Array.isArray(jan1?.buckets)).toBe(true);
  });

  it("each entry's buckets array has { bucket, count } shape with numeric values", async () => {
    mockSelect.mockReturnValue(
      makeChain([
        { bucket: new Date("2026-01-05"), similarityBucket: 0.5, count: 3 },
      ]),
    );
    const window = {
      start: new Date("2026-01-05"),
      end: new Date("2026-01-05"),
    };
    const result = await getSimilarityTrend(window, "day");
    if (result.length > 0) {
      result[0].buckets.forEach((b) => {
        expect(b).toHaveProperty("bucket");
        expect(b).toHaveProperty("count");
        expect(typeof b.bucket).toBe("number");
        expect(typeof b.count).toBe("number");
      });
    }
  });

  it("returns an array (possibly empty) when no data in window", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-01"),
    };
    const result = await getSimilarityTrend(window, "day");
    expect(Array.isArray(result)).toBe(true);
  });

  it("passes gte + lte on updatedAt when window provided", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-07");
    await getSimilarityTrend({ start, end }, "day");
    expect(mockGte).toHaveBeenCalledWith("updated_at", start);
    expect(mockLte).toHaveBeenCalledWith("updated_at", end);
    expect(mockAnd).toHaveBeenCalled();
  });

  it("accepts week granularity and returns array result", async () => {
    mockSelect.mockReturnValue(
      makeChain([
        { bucket: new Date("2025-12-29"), similarityBucket: 0.9, count: 10 },
      ]),
    );
    const window = {
      start: new Date("2025-12-29"),
      end: new Date("2026-01-11"),
    };
    const result = await getSimilarityTrend(window, "week");
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("detectThresholdDrift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns status=ok when auto rate exceeds warn threshold and disambig rate is below warn threshold", async () => {
    // auto=60/100=0.60 >= WARN(0.55), disambig=20/100=0.20 <= WARN(0.30)
    mockSelect.mockReturnValue(
      makeChain([
        { matchMethod: "auto", count: 60 },
        { matchMethod: "llm_disambig", count: 20 },
        { matchMethod: "new", count: 20 },
      ]),
    );
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-07"),
    };
    const result = await detectThresholdDrift(window);
    expect(result.status).toBe("ok");
    expect(result).toHaveProperty("reason");
    expect(result).toHaveProperty("rates");
    expect(result.rates.total).toBe(100);
  });

  it("returns status=warn when auto rate is between floor and warn threshold", async () => {
    // auto=45/100=0.45 — below warn (0.55) but above floor (0.40) → warn
    mockSelect.mockReturnValue(
      makeChain([
        { matchMethod: "auto", count: 45 },
        { matchMethod: "llm_disambig", count: 25 },
        { matchMethod: "new", count: 30 },
      ]),
    );
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-07"),
    };
    const result = await detectThresholdDrift(window);
    expect(result.status).toBe("warn");
    expect(result.reason).toMatch(/auto/i);
  });

  it("returns status=warn when disambig rate is between warn and ceiling threshold", async () => {
    // disambig=35/100=0.35 — above warn (0.30) but below ceiling (0.40) → warn
    mockSelect.mockReturnValue(
      makeChain([
        { matchMethod: "auto", count: 60 },
        { matchMethod: "llm_disambig", count: 35 },
        { matchMethod: "new", count: 5 },
      ]),
    );
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-07"),
    };
    const result = await detectThresholdDrift(window);
    expect(result.status).toBe("warn");
    expect(result.reason).toMatch(/disambig/i);
  });

  it("returns status=alert when auto rate drops below the alert floor", async () => {
    // auto=30/100=0.30 < floor (0.40) → alert
    mockSelect.mockReturnValue(
      makeChain([
        { matchMethod: "auto", count: 30 },
        { matchMethod: "llm_disambig", count: 40 },
        { matchMethod: "new", count: 30 },
      ]),
    );
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-07"),
    };
    const result = await detectThresholdDrift(window);
    expect(result.status).toBe("alert");
    expect(result.reason).toMatch(/auto/i);
    expect(result.reason).toMatch(/0\.3/);
  });

  it("returns status=alert when disambig rate exceeds the ceiling threshold", async () => {
    // disambig=45/100=0.45 > ceiling (0.40) → alert
    mockSelect.mockReturnValue(
      makeChain([
        { matchMethod: "auto", count: 55 },
        { matchMethod: "llm_disambig", count: 45 },
        { matchMethod: "new", count: 0 },
      ]),
    );
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-07"),
    };
    const result = await detectThresholdDrift(window);
    expect(result.status).toBe("alert");
    expect(result.reason).toMatch(/disambig/i);
    expect(result.reason).toMatch(/0\.45/);
  });

  it("returns status=ok with total=0 when window has no resolutions (divide-by-zero guard)", async () => {
    mockSelect.mockReturnValue(makeChain([]));
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-07"),
    };
    const result = await detectThresholdDrift(window);
    expect(result.status).toBe("ok");
    expect(result.rates.total).toBe(0);
    expect(result.rates.auto).toBe(0);
    expect(result.rates.disambig).toBe(0);
  });

  it("alert wins over warn when both auto and disambig are in violation", async () => {
    // auto=25/100=0.25 < floor (0.40) AND disambig=45/100=0.45 > ceiling (0.40)
    mockSelect.mockReturnValue(
      makeChain([
        { matchMethod: "auto", count: 25 },
        { matchMethod: "llm_disambig", count: 45 },
        { matchMethod: "new", count: 30 },
      ]),
    );
    const window = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-07"),
    };
    const result = await detectThresholdDrift(window);
    expect(result.status).toBe("alert");
  });
});
