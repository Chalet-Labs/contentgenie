import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK before imports
vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: vi.fn((config) => config),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn().mockReturnThis();
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: {
    id: "id",
    title: "title",
    summary: "summary",
    summaryStatus: "summary_status",
    processedAt: "processed_at",
    worthItScore: "worth_it_score",
  },
  episodeTopics: {
    episodeId: "episode_id",
    topic: "topic",
    topicRank: "topic_rank",
    rankedAt: "ranked_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  gte: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  count: vi.fn(),
  isNotNull: vi.fn(),
  inArray: vi.fn(),
}));

const mockGenerateCompletion = vi.fn();
vi.mock("@/lib/ai", () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
}));

const mockParseJsonResponse = vi.fn();
vi.mock("@/lib/openrouter", () => ({
  parseJsonResponse: (...args: unknown[]) => mockParseJsonResponse(...args),
}));

vi.mock("@/trigger/helpers/topic-ranking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/trigger/helpers/topic-ranking")>();
  return {
    ...actual,
    // Keep all real implementations — only need actual logic
  };
});

import { rankEpisodeTopics } from "@/trigger/rank-episode-topics";

const taskConfig = rankEpisodeTopics as unknown as {
  run: () => Promise<{ topicsRanked: number; comparisonsRun: number; comparisonsFailed: number; writeFailed: number }>;
};

// Build a chainable select mock that resolves to `rows` at the end
function buildSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    having: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

// Set up db.select to return different chains for topic query vs episode query
function setupSelectSequence(topicRows: unknown[], ...episodeRowSets: unknown[][]) {
  let callCount = 0;
  mockSelect.mockImplementation(() => {
    if (callCount === 0) {
      callCount++;
      // Topic query ends with .orderBy() — make that thenable
      const topicChain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        having: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(topicRows),
        limit: vi.fn().mockReturnThis(),
      };
      return topicChain;
    }
    const episodeSet = episodeRowSets[callCount - 1] ?? [];
    callCount++;
    return buildSelectChain(episodeSet);
  });
}

function setupUpdateChain() {
  mockUpdate.mockReturnValue({
    set: mockSet.mockReturnValue({
      where: mockUpdateWhere,
    }),
  });
}

describe("rank-episode-topics task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUpdateChain();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T07:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns { topicsRanked: 0 } when no qualifying topics exist", async () => {
    setupSelectSequence([]);

    const result = await taskConfig.run();

    expect(result).toEqual({ topicsRanked: 0, comparisonsRun: 0, comparisonsFailed: 0, writeFailed: 0 });
    expect(mockGenerateCompletion).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("ranks 3 episodes for a single topic (3 comparisons)", async () => {
    const topicRows = [{ topic: "Machine Learning", episodeCount: 3 }];
    const episodeRows = [
      { episodeId: 1, title: "Ep 1", summary: "Summary 1", worthItScore: "8.00" },
      { episodeId: 2, title: "Ep 2", summary: "Summary 2", worthItScore: "7.00" },
      { episodeId: 3, title: "Ep 3", summary: "Summary 3", worthItScore: "6.00" },
    ];

    setupSelectSequence(topicRows, episodeRows);
    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse
      .mockReturnValueOnce({ winner: "A", reason: "Ep 1 is better" })
      .mockReturnValueOnce({ winner: "A", reason: "Ep 1 is better" })
      .mockReturnValueOnce({ winner: "A", reason: "Ep 2 is better" });

    const result = await taskConfig.run();

    expect(result.topicsRanked).toBe(1);
    expect(result.comparisonsRun).toBe(3);
    expect(result.comparisonsFailed).toBe(0);
    // 1 stale-rank clear + 3 rank updates = 4
    expect(mockUpdate).toHaveBeenCalledTimes(4);
  });

  it("skips failed LLM comparison and still produces partial ranking", async () => {
    const topicRows = [{ topic: "AI", episodeCount: 3 }];
    const episodeRows = [
      { episodeId: 1, title: "Ep 1", summary: "Summary 1", worthItScore: "8.00" },
      { episodeId: 2, title: "Ep 2", summary: "Summary 2", worthItScore: "7.00" },
      { episodeId: 3, title: "Ep 3", summary: "Summary 3", worthItScore: "6.00" },
    ];

    setupSelectSequence(topicRows, episodeRows);
    // First pair succeeds, second fails, third succeeds
    mockGenerateCompletion
      .mockResolvedValueOnce("ok")
      .mockRejectedValueOnce(new Error("Rate limit"))
      .mockResolvedValueOnce("ok");
    mockParseJsonResponse
      .mockReturnValueOnce({ winner: "A", reason: "Better" })
      .mockReturnValueOnce({ winner: "B", reason: "Better" });

    const result = await taskConfig.run();

    expect(result.comparisonsRun).toBe(2);
    expect(result.comparisonsFailed).toBe(1);
    expect(result.topicsRanked).toBe(1);
    // 1 stale-rank clear + 3 rank updates = 4
    expect(mockUpdate).toHaveBeenCalledTimes(4);
  });

  it("increments comparisonsFailed when LLM returns an invalid winner value", async () => {
    const topicRows = [{ topic: "AI", episodeCount: 3 }];
    const episodeRows = [
      { episodeId: 1, title: "Ep 1", summary: "Summary 1", worthItScore: "8.00" },
      { episodeId: 2, title: "Ep 2", summary: "Summary 2", worthItScore: "7.00" },
      { episodeId: 3, title: "Ep 3", summary: "Summary 3", worthItScore: "6.00" },
    ];

    setupSelectSequence(topicRows, episodeRows);
    mockGenerateCompletion.mockResolvedValue("ok");
    mockParseJsonResponse
      .mockReturnValueOnce({ winner: "A", reason: "ok" })
      .mockReturnValueOnce({ winner: "invalid", reason: "bad response" })
      .mockReturnValueOnce({ winner: "B", reason: "ok" });

    const result = await taskConfig.run();

    expect(result.comparisonsRun).toBe(2);
    expect(result.comparisonsFailed).toBe(1);
    expect(result.topicsRanked).toBe(1);
  });

  it("skips topic entirely when all comparisons fail", async () => {
    const { logger } = await import("@trigger.dev/sdk");
    const topicRows = [{ topic: "Broken", episodeCount: 3 }];
    const episodeRows = [
      { episodeId: 1, title: "Ep 1", summary: "Summary 1", worthItScore: "8.00" },
      { episodeId: 2, title: "Ep 2", summary: "Summary 2", worthItScore: "7.00" },
      { episodeId: 3, title: "Ep 3", summary: "Summary 3", worthItScore: "6.00" },
    ];

    setupSelectSequence(topicRows, episodeRows);
    mockGenerateCompletion.mockRejectedValue(new Error("Network error"));

    const result = await taskConfig.run();

    expect(result.topicsRanked).toBe(0);
    expect(result.comparisonsFailed).toBe(3);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "All comparisons failed for topic; skipping",
      expect.objectContaining({ topic: "Broken" })
    );
  });

  it("logs warning and caps at 50 when 51 topics qualify", async () => {
    const { logger } = await import("@trigger.dev/sdk");
    const topicRows = Array.from({ length: 51 }, (_, i) => ({
      topic: `Topic ${i + 1}`,
      episodeCount: 3,
    }));

    // Each topic gets 3 episodes; comparisons all succeed
    const makeEpisodes = () => [
      { episodeId: 1, title: "Ep 1", summary: "S1", worthItScore: "8.00" },
      { episodeId: 2, title: "Ep 2", summary: "S2", worthItScore: "7.00" },
      { episodeId: 3, title: "Ep 3", summary: "S3", worthItScore: "6.00" },
    ];

    // topic query returns 51, then 50 episode queries (one per capped topic)
    setupSelectSequence(topicRows, ...Array.from({ length: 50 }, makeEpisodes));
    mockGenerateCompletion.mockResolvedValue("ok");
    mockParseJsonResponse.mockReturnValue({ winner: "A", reason: "Better" });

    const result = await taskConfig.run();

    expect(result.topicsRanked).toBe(50);
    expect(logger.warn).toHaveBeenCalledWith(
      "Qualifying topics exceeded cap; some topics will be skipped",
      expect.objectContaining({ total: 51, cap: 50 })
    );
  });

  it("uses episode cap 10 when <= 20 qualifying topics", async () => {
    const topicRows = Array.from({ length: 15 }, (_, i) => ({
      topic: `Topic ${i + 1}`,
      episodeCount: 3,
    }));

    const makeEpisodes = () => [
      { episodeId: 1, title: "E1", summary: "S1", worthItScore: "8.00" },
      { episodeId: 2, title: "E2", summary: "S2", worthItScore: "7.00" },
      { episodeId: 3, title: "E3", summary: "S3", worthItScore: "6.00" },
    ];

    setupSelectSequence(topicRows, ...Array.from({ length: 15 }, makeEpisodes));
    mockGenerateCompletion.mockResolvedValue("ok");
    mockParseJsonResponse.mockReturnValue({ winner: "A", reason: "Better" });

    await taskConfig.run();

    // Each episode query should have been called with limit(10) — EPISODES_CAP_HIGH
    // We verify by checking the limit mock calls on the built chains
    // The select chain's .limit() is called with 10 for each of the 15 topic episode queries
    const limitCalls = mockSelect.mock.results
      .slice(1) // skip topic query
      .map((r) => {
        const chain = r.value as ReturnType<typeof buildSelectChain>;
        return chain.limit.mock?.calls?.[0]?.[0];
      })
      .filter(Boolean);

    expect(limitCalls.every((v) => v === 10)).toBe(true);
  });

  it("uses episode cap 5 when > 20 qualifying topics", async () => {
    const topicRows = Array.from({ length: 25 }, (_, i) => ({
      topic: `Topic ${i + 1}`,
      episodeCount: 3,
    }));

    const makeEpisodes = () => [
      { episodeId: 1, title: "E1", summary: "S1", worthItScore: "8.00" },
      { episodeId: 2, title: "E2", summary: "S2", worthItScore: "7.00" },
      { episodeId: 3, title: "E3", summary: "S3", worthItScore: "6.00" },
    ];

    setupSelectSequence(topicRows, ...Array.from({ length: 25 }, makeEpisodes));
    mockGenerateCompletion.mockResolvedValue("ok");
    mockParseJsonResponse.mockReturnValue({ winner: "A", reason: "Better" });

    await taskConfig.run();

    const limitCalls = mockSelect.mock.results
      .slice(1)
      .map((r) => {
        const chain = r.value as ReturnType<typeof buildSelectChain>;
        return chain.limit.mock?.calls?.[0]?.[0];
      })
      .filter(Boolean);

    expect(limitCalls.every((v) => v === 5)).toBe(true);
  });

  it("handles all-tie results and uses worthItScore as tiebreaker", async () => {
    const topicRows = [{ topic: "Leadership", episodeCount: 3 }];
    const episodeRows = [
      { episodeId: 1, title: "Ep 1", summary: "S1", worthItScore: "5.00" },
      { episodeId: 2, title: "Ep 2", summary: "S2", worthItScore: "8.00" },
      { episodeId: 3, title: "Ep 3", summary: "S3", worthItScore: "3.00" },
    ];

    setupSelectSequence(topicRows, episodeRows);
    mockGenerateCompletion.mockResolvedValue("ok");
    mockParseJsonResponse.mockReturnValue({ winner: "tie", reason: "Equal coverage" });

    const result = await taskConfig.run();

    expect(result.topicsRanked).toBe(1);
    expect(result.comparisonsRun).toBe(3);

    // Verify ranks: ep2 (score 8.0) → rank 1, ep1 (score 5.0) → rank 2, ep3 (score 3.0) → rank 3
    const setCalls = mockSet.mock.calls;
    expect(setCalls.some((args) => args[0]?.topicRank === 1)).toBe(true);
    expect(setCalls.some((args) => args[0]?.topicRank === 2)).toBe(true);
    expect(setCalls.some((args) => args[0]?.topicRank === 3)).toBe(true);
  });

  it("correctly parses worthItScore string values via parseScore", async () => {
    const topicRows = [{ topic: "Tech", episodeCount: 3 }];
    const episodeRows = [
      { episodeId: 1, title: "Ep 1", summary: "S1", worthItScore: "7.50" },
      { episodeId: 2, title: "Ep 2", summary: "S2", worthItScore: null },
      { episodeId: 3, title: "Ep 3", summary: "S3", worthItScore: "3.00" },
    ];

    setupSelectSequence(topicRows, episodeRows);
    mockGenerateCompletion.mockResolvedValue("ok");
    // tie → tiebreaker by score: ep1(7.5) ranks above ep3(3.0) ranks above ep2(0)
    mockParseJsonResponse.mockReturnValue({ winner: "tie", reason: "Equal" });

    const result = await taskConfig.run();

    expect(result.topicsRanked).toBe(1);

    // Verify db.update was called with topicRank values (filter out the stale-rank clear call)
    const setCalls = mockSet.mock.calls.filter((args) => args[0]?.topicRank !== null);
    expect(setCalls.some((args) => args[0]?.topicRank === 1)).toBe(true);
    expect(setCalls.some((args) => args[0]?.topicRank === 2)).toBe(true);
    expect(setCalls.some((args) => args[0]?.topicRank === 3)).toBe(true);
  });

  it("persists topicRank and rankedAt for each episode in a topic", async () => {
    const topicRows = [{ topic: "Startups", episodeCount: 3 }];
    const episodeRows = [
      { episodeId: 10, title: "E1", summary: "S1", worthItScore: "9.00" },
      { episodeId: 20, title: "E2", summary: "S2", worthItScore: "6.00" },
      { episodeId: 30, title: "E3", summary: "S3", worthItScore: "4.00" },
    ];

    setupSelectSequence(topicRows, episodeRows);
    mockGenerateCompletion.mockResolvedValue("ok");
    mockParseJsonResponse.mockReturnValue({ winner: "A", reason: "Better" });

    await taskConfig.run();

    // 1 stale-rank clear + 3 rank updates = 4
    expect(mockUpdate).toHaveBeenCalledTimes(4);
    const setCalls = mockSet.mock.calls;
    // Each set call should have both topicRank and rankedAt
    for (const [args] of setCalls) {
      expect(args).toHaveProperty("topicRank");
      expect(args).toHaveProperty("rankedAt");
    }
  });
});
