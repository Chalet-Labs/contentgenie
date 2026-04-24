import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock the db module. Each query method needs to be independently mockable.
// Since overview-queries uses db.select().from().where()... chaining, we intercept at the top level.

const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: {
    transcriptStatus: "transcript_status",
    summaryStatus: "summary_status",
    transcriptSource: "transcript_source",
    updatedAt: "updated_at",
    processedAt: "processed_at",
  },
  podcasts: {},
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(() => "COUNT(*)"),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({
      as: (alias: string) => ({ sql: strings.join(""), alias }),
      toString: () => strings.join(""),
    }),
    { raw: (s: string) => s },
  ),
  or: vi.fn((...args) => ({ or: args })),
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
  gte: vi.fn((col, val) => ({ gte: [col, val] })),
  lte: vi.fn((col, val) => ({ lte: [col, val] })),
}));

// Helper: creates a fluent query chain that resolves to the given rows
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
  getOverviewStats,
  getTranscriptSourceBreakdown,
  getFailureTrend,
} from "@/lib/admin/overview-queries";

describe("getOverviewStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero-state when no rows", async () => {
    mockSelect.mockReturnValue(makeChain([{ value: 0 }]));

    const stats = await getOverviewStats();

    expect(stats.totalPodcasts).toBe(0);
    expect(stats.totalEpisodes).toBe(0);
    expect(stats.transcriptCoverage).toBe(0);
    expect(stats.summaryCoverage).toBe(0);
    expect(stats.processedToday).toBe(0);
    expect(stats.queueDepthApprox).toBe(0);
    expect(stats.activeFetchesApprox).toBe(0);
  });

  it("calculates coverage percentages correctly", async () => {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      // Order: podcasts, episodes, transcripts, summaries, today, queue, fetches
      const values: Record<number, unknown[]> = {
        1: [{ value: 10 }], // podcasts
        2: [{ value: 100 }], // episodes
        3: [{ value: 50 }], // transcripts
        4: [{ value: 40 }], // summaries
        5: [{ value: 5 }], // today
        6: [{ value: 3 }], // queue
        7: [{ value: 2 }], // fetches
      };
      return makeChain(values[callCount] ?? [{ value: 0 }]);
    });

    const stats = await getOverviewStats();
    expect(stats.totalPodcasts).toBe(10);
    expect(stats.totalEpisodes).toBe(100);
    expect(stats.transcriptCoverage).toBe(50);
    expect(stats.summaryCoverage).toBe(40);
    expect(stats.processedToday).toBe(5);
    expect(stats.queueDepthApprox).toBe(3);
    expect(stats.activeFetchesApprox).toBe(2);
  });
});

describe("getTranscriptSourceBreakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups correctly and handles null source", async () => {
    mockSelect.mockReturnValue(
      makeChain([
        { source: "assemblyai", count: 30 },
        { source: "podcastindex", count: 20 },
        { source: null, count: 5 },
      ]),
    );

    const result = await getTranscriptSourceBreakdown();

    expect(result).toHaveLength(3);
    expect(result.find((r) => r.source === null)).toBeDefined();
    expect(result.find((r) => r.source === null)?.count).toBe(5);
    expect(result.find((r) => r.source === "assemblyai")?.count).toBe(30);
  });
});

describe("getFailureTrend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always returns exactly 7 entries", async () => {
    // DB returns only 2 days with failures
    mockSelect.mockReturnValue(
      makeChain([
        { day: "2026-03-20", count: 3 },
        { day: "2026-03-22", count: 1 },
      ]),
    );

    const result = await getFailureTrend();
    expect(result).toHaveLength(7);
  });

  it("fills in 0 for days with no failures", async () => {
    mockSelect.mockReturnValue(makeChain([]));

    const result = await getFailureTrend();

    expect(result).toHaveLength(7);
    expect(result.every((r) => r.count === 0)).toBe(true);
  });

  it("includes the correct count for days that do have failures", async () => {
    // Get today's date string to match what the function generates
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    mockSelect.mockReturnValue(makeChain([{ day: todayStr, count: 7 }]));

    const result = await getFailureTrend();
    const todayEntry = result.find((r) => r.day === todayStr);
    expect(todayEntry?.count).toBe(7);
  });
});
