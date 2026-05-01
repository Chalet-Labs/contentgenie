import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTriggerSdkMock } from "@/test/mocks/trigger-sdk";

// ─── Trigger.dev SDK mock ─────────────────────────────────────────────────────

const mockMetadataSet = vi.fn();
const mockMetadataIncrement = vi.fn();
const mockLoggerInfo = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock("@trigger.dev/sdk", () =>
  createTriggerSdkMock({
    metadata: {
      set: (...args: unknown[]) => mockMetadataSet(...args),
      increment: (...args: unknown[]) => mockMetadataIncrement(...args),
    },
    logger: {
      info: (...args: unknown[]) => mockLoggerInfo(...args),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
    },
  }),
);

// ─── Database mock ────────────────────────────────────────────────────────────

const mockDbSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: {
    id: "episodes.id",
    summary: "episodes.summary",
    createdAt: "episodes.createdAt",
  },
  episodeCanonicalTopics: {
    episodeId: "ect.episodeId",
  },
}));

// ─── Drizzle-ORM tagged stubs (structurally inspectable) ──────────────────────

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
  isNull: vi.fn((col: unknown) => ({ type: "isNull", col })),
  isNotNull: vi.fn((col: unknown) => ({ type: "isNotNull", col })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({
    type: "inArray",
    col,
    vals,
  })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
  desc: vi.fn((col: unknown) => ({ type: "desc", col })),
  sql: vi.fn((...args: unknown[]) => ({
    type: "sql",
    template: (args[0] as TemplateStringsArray)?.[0] ?? args[0],
  })),
}));

// ─── AI / prompt mocks ────────────────────────────────────────────────────────

const mockGenerateCompletion = vi.fn();
vi.mock("@/lib/ai", () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
}));

const mockGetCategoryBanlist = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/category-banlist", () => ({
  getCategoryBanlist: (...args: unknown[]) => mockGetCategoryBanlist(...args),
}));

const mockGetTopicReextractPrompt = vi.fn().mockReturnValue("mock-prompt");
vi.mock("@/lib/prompts/topic-reextract", () => ({
  getTopicReextractPrompt: (...args: unknown[]) =>
    mockGetTopicReextractPrompt(...args),
  TOPIC_REEXTRACT_SYSTEM_PROMPT: "mock-system-prompt",
}));

// parseJsonResponse and normalizeTopics are mocked via their modules
const mockParseJsonResponse = vi.fn().mockReturnValue({ topics: [] });
vi.mock("@/lib/openrouter", () => ({
  parseJsonResponse: (...args: unknown[]) => mockParseJsonResponse(...args),
}));

const mockNormalizeTopics = vi.fn().mockReturnValue([
  {
    label: "Test Topic",
    kind: "concept",
    summary: "A test topic.",
    aliases: [],
    ongoing: false,
    relevance: 0.8,
    coverageScore: 0.7,
  },
]);
vi.mock("@/trigger/helpers/ai-summary", () => ({
  normalizeTopics: (...args: unknown[]) => mockNormalizeTopics(...args),
}));

const mockResolveAndPersistEpisodeTopics = vi.fn().mockResolvedValue({
  resolved: 1,
  failed: 0,
  matchMethodDistribution: { auto: 1, llm_disambig: 0, new: 0 },
  versionTokenForcedDisambig: 0,
  candidatesConsidered: { p50: 0, max: 0 },
  budgetExhausted: false,
  topicCount: 1,
});
vi.mock("@/trigger/helpers/resolve-topics", () => ({
  resolveAndPersistEpisodeTopics: (...args: unknown[]) =>
    mockResolveAndPersistEpisodeTopics(...args),
}));

// ─── Import task after all mocks ──────────────────────────────────────────────

import { backfillCanonicalTopics } from "@/trigger/backfill-canonical-topics";
import type { BackfillPayload } from "@/trigger/backfill-canonical-topics";

const taskConfig = backfillCanonicalTopics as unknown as {
  run: (payload: BackfillPayload) => Promise<{
    processed: number;
    resolved: number;
    failed: number;
    skippedShortSummary: number;
    dryRun: boolean;
  }>;
  queue: { name: string; concurrencyLimit: number };
  maxDuration: number;
  retry: { maxAttempts: number };
};

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type EpisodeRow = { id: number; summary: string };

/**
 * Sets up the main-path query mock (LEFT JOIN branch).
 * Returns captured WHERE arguments for structural inspection.
 */
function setupMainPathMock(
  rows: EpisodeRow[],
  captureWhere?: (w: unknown) => void,
) {
  const whereImpl = vi.fn().mockImplementation((whereArg: unknown) => {
    captureWhere?.(whereArg);
    return {
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    };
  });
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({ where: whereImpl }),
    }),
  });
  return { whereImpl };
}

/**
 * Sets up the episodeIds-path query mock (no LEFT JOIN).
 * Returns captured WHERE arguments for structural inspection.
 */
function setupEpisodeIdsPathMock(
  rows: EpisodeRow[],
  captureWhere?: (w: unknown) => void,
) {
  const whereImpl = vi.fn().mockImplementation((whereArg: unknown) => {
    captureWhere?.(whereArg);
    return Promise.resolve(rows);
  });
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({ where: whereImpl }),
  });
  return { whereImpl };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("backfill-canonical-topics task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCategoryBanlist.mockResolvedValue([]);
    mockGenerateCompletion.mockResolvedValue('{"topics":[]}');
    mockParseJsonResponse.mockReturnValue({ topics: [] });
    mockNormalizeTopics.mockReturnValue([
      {
        label: "Test Topic",
        kind: "concept",
        summary: "A test topic.",
        aliases: [],
        ongoing: false,
        relevance: 0.8,
        coverageScore: 0.7,
      },
    ]);
    mockResolveAndPersistEpisodeTopics.mockResolvedValue({
      resolved: 1,
      failed: 0,
      matchMethodDistribution: { auto: 1, llm_disambig: 0, new: 0 },
      versionTokenForcedDisambig: 0,
      candidatesConsidered: { p50: 0, max: 0 },
      budgetExhausted: false,
      topicCount: 1,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Case 1: per-episode happy path ──────────────────────────────────────────

  it("case 1 — happy path: 1 episode → resolver called once with correct args", async () => {
    const episode = { id: 7, summary: "A summary about AI releases." };
    setupMainPathMock([episode]);

    const result = await taskConfig.run({});

    expect(mockResolveAndPersistEpisodeTopics).toHaveBeenCalledOnce();
    expect(mockResolveAndPersistEpisodeTopics).toHaveBeenCalledWith(
      episode.id,
      expect.any(Array), // normalizeTopics result
      episode.summary,
      expect.objectContaining({ skipResolution: false }),
    );
    expect(result.processed).toBe(1);
    expect(result.resolved).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.dryRun).toBe(false);
  });

  // ── Case 2: batch of 5 ───────────────────────────────────────────────────────

  it("case 2 — batch of 5: resolver called 5× with aggregate counters correct", async () => {
    const episodes = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      summary: `Summary ${i + 1} about a real topic.`,
    }));
    setupMainPathMock(episodes);

    const result = await taskConfig.run({});

    expect(mockResolveAndPersistEpisodeTopics).toHaveBeenCalledTimes(5);
    expect(result.processed).toBe(5);
    expect(result.resolved).toBe(5); // 1 resolved per episode
    expect(result.failed).toBe(0);
  });

  // ── Case 3: idempotent re-run ─────────────────────────────────────────────

  it("case 3 — idempotent re-run: empty SELECT returns processed: 0", async () => {
    setupMainPathMock([]);

    const result = await taskConfig.run({});

    expect(mockResolveAndPersistEpisodeTopics).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(0);
  });

  // ── Case 4: dry-run mode ─────────────────────────────────────────────────

  it("case 4 — dry-run: resolver NOT called; counters still advance", async () => {
    const episodes = [
      { id: 10, summary: "First dry-run summary." },
      { id: 11, summary: "Second dry-run summary." },
    ];
    setupMainPathMock(episodes);

    const result = await taskConfig.run({ dryRun: true });

    expect(mockResolveAndPersistEpisodeTopics).not.toHaveBeenCalled();
    expect(result.processed).toBe(2);
    expect(result.dryRun).toBe(true);
  });

  // ── Case 5: per-episode failure isolation ─────────────────────────────────

  it("case 5 — failure isolation: middle episode throws; loop continues; failed:1, resolved:2", async () => {
    const episodes = [
      { id: 1, summary: "First episode summary." },
      { id: 2, summary: "Second episode summary — will fail." },
      { id: 3, summary: "Third episode summary." },
    ];
    setupMainPathMock(episodes);

    mockGenerateCompletion
      .mockResolvedValueOnce('{"topics":[]}')
      .mockRejectedValueOnce(new Error("OpenRouter timeout"))
      .mockResolvedValueOnce('{"topics":[]}');

    const result = await taskConfig.run({});

    expect(mockResolveAndPersistEpisodeTopics).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.resolved).toBe(2); // episodes 1 & 3
  });

  // ── Case 6: episodeIds payload — inArray path with null/length floor guards ─

  it("case 6 — episodeIds path: inArray query with isNotNull + length floor asserted in WHERE", async () => {
    const episodes = [
      { id: 42, summary: "Episode 42 summary text that is long enough." },
      { id: 43, summary: "Episode 43 summary text that is long enough." },
    ];

    let capturedWhere: unknown;
    setupEpisodeIdsPathMock(episodes, (w) => {
      capturedWhere = w;
    });

    const result = await taskConfig.run({ episodeIds: [42, 43] });

    // WHERE clause must include inArray, isNotNull, and sql length guard
    expect(capturedWhere).toMatchObject({
      type: "and",
      conditions: expect.arrayContaining([
        { type: "inArray", col: "episodes.id", vals: [42, 43] },
        { type: "isNotNull", col: "episodes.summary" },
        expect.objectContaining({ type: "sql" }), // length >= 100 guard
      ]),
    });

    expect(mockResolveAndPersistEpisodeTopics).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.failed).toBe(0);
  });

  // ── Case 7: inter-episode delay ────────────────────────────────────────────

  it("case 7 — inter-episode delay: 500ms setTimeout fires between episodes", async () => {
    vi.useFakeTimers();

    const episodes = [
      { id: 20, summary: "First timer-test episode summary." },
      { id: 21, summary: "Second timer-test episode summary." },
    ];
    setupMainPathMock(episodes);

    // Start the run but don't await — the loop will block on setTimeout
    const runPromise = taskConfig.run({});

    // Advance past both inter-episode delays (2 episodes = 1 delay between them + 1 after)
    await vi.advanceTimersByTimeAsync(1100);
    const result = await runPromise;

    expect(result.processed).toBe(2);
  });

  // ── Case 8: NULL/empty summary skip (main path WHERE structure) ────────────

  it("case 8 — NULL/empty summary skip: main-path WHERE has isNull(ect) + isNotNull(summary) + length sql guard", async () => {
    let capturedWhere: unknown;
    setupMainPathMock([], (w) => {
      capturedWhere = w;
    });

    const result = await taskConfig.run({});

    // The WHERE clause for the main LEFT JOIN path must compose all three guards
    expect(capturedWhere).toMatchObject({
      type: "and",
      conditions: expect.arrayContaining([
        { type: "isNull", col: "ect.episodeId" },
        { type: "isNotNull", col: "episodes.summary" },
        expect.objectContaining({ type: "sql" }), // length(summary) >= 100
      ]),
    });

    // Zero rows returned → task reports processed: 0
    expect(result.processed).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(0);
  });

  // ── Task config assertions ────────────────────────────────────────────────

  it("task config: id, queue, concurrencyLimit, maxDuration, retry", () => {
    const config = backfillCanonicalTopics as unknown as {
      id: string;
      queue: { name: string; concurrencyLimit: number };
      maxDuration: number;
      retry: { maxAttempts: number };
    };
    expect(config.queue.name).toBe("backfill-canonical-topics-queue");
    expect(config.queue.concurrencyLimit).toBe(2);
    expect(config.maxDuration).toBe(60 * 30);
    expect(config.retry.maxAttempts).toBe(1);
  });
});
