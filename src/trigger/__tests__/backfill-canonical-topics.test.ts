import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTriggerSdkMock } from "@/test/mocks/trigger-sdk";

// ─── Trigger.dev SDK mock ─────────────────────────────────────────────────────

const mockMetadataSet = vi.fn();
const mockMetadataIncrement = vi.fn();
const mockLoggerInfo = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock("@trigger.dev/sdk", () =>
  createTriggerSdkMock({
    metadata: {
      set: (...args: unknown[]) => mockMetadataSet(...args),
      increment: (...args: unknown[]) => mockMetadataIncrement(...args),
    },
    logger: {
      info: (...args: unknown[]) => mockLoggerInfo(...args),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
      error: (...args: unknown[]) => mockLoggerError(...args),
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
  // Capture the full template + interpolated values so tests can pin the
  // numeric `>= 100` floor, not just the type tag.
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: "sql",
    template: Array.isArray(strings) ? Array.from(strings) : strings,
    values,
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

import {
  backfillCanonicalTopics,
  BACKFILL_DEFAULT_BATCH_SIZE,
  BACKFILL_INTER_EPISODE_DELAY_MS,
  BACKFILL_MAX_OUTPUT_TOKENS,
  BACKFILL_MIN_SUMMARY_LENGTH,
  BACKFILL_TEMPERATURE,
} from "@/trigger/backfill-canonical-topics";
import type {
  BackfillPayload,
  BackfillResult,
} from "@/trigger/backfill-canonical-topics";

const taskConfig = backfillCanonicalTopics as unknown as {
  run: (payload: BackfillPayload) => Promise<BackfillResult>;
  queue: { name: string; concurrencyLimit: number };
  maxDuration: number;
  retry: { maxAttempts: number };
};

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type EpisodeRow = { id: number; summary: string };

/**
 * Sets up the main-path query mock (LEFT JOIN branch).
 * Returns captured WHERE arguments for structural inspection plus the
 * `.limit()` invocation so tests can assert on the batchSize argument.
 */
function setupMainPathMock(
  rows: EpisodeRow[],
  captureWhere?: (w: unknown) => void,
) {
  const limitImpl = vi.fn().mockResolvedValue(rows);
  const orderByImpl = vi.fn().mockReturnValue({ limit: limitImpl });
  const whereImpl = vi.fn().mockImplementation((whereArg: unknown) => {
    captureWhere?.(whereArg);
    return { orderBy: orderByImpl };
  });
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({ where: whereImpl }),
    }),
  });
  return { whereImpl, limitImpl };
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
    vi.useFakeTimers();
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Helper: run the task with fake timers, advancing through every
  // inter-episode delay so the loop completes synchronously from the
  // test's point of view.
  async function runTask(payload: BackfillPayload, episodeCount: number) {
    const promise = taskConfig.run(payload);
    // (n - 1) inter-episode delays for n episodes — the tail delay is now skipped.
    const totalAdvanceMs =
      Math.max(episodeCount - 1, 0) * BACKFILL_INTER_EPISODE_DELAY_MS + 50;
    await vi.advanceTimersByTimeAsync(totalAdvanceMs);
    return promise;
  }

  // ── Case 1: per-episode happy path ──────────────────────────────────────────

  it("case 1 — happy path: 1 episode → resolver called once with correct args", async () => {
    const episode = { id: 7, summary: "A summary about AI releases." };
    setupMainPathMock([episode]);

    const result = await runTask({}, 1);

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
  });

  // ── Case 2: batch of 5 ───────────────────────────────────────────────────────

  it("case 2 — batch of 5: resolver called 5× with aggregate counters correct", async () => {
    const episodes = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      summary: `Summary ${i + 1} about a real topic.`,
    }));
    setupMainPathMock(episodes);

    const result = await runTask({}, 5);

    expect(mockResolveAndPersistEpisodeTopics).toHaveBeenCalledTimes(5);
    expect(result.processed).toBe(5);
    expect(result.resolved).toBe(5); // 1 resolved per episode
    expect(result.failed).toBe(0);
  });

  // ── Case 3: idempotent re-run ─────────────────────────────────────────────

  it("case 3 — idempotent re-run: empty SELECT returns processed: 0", async () => {
    setupMainPathMock([]);

    const result = await runTask({}, 0);

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

    const result = await runTask({ dryRun: true }, 2);

    expect(mockResolveAndPersistEpisodeTopics).not.toHaveBeenCalled();
    expect(result.processed).toBe(2);
    // Result type no longer carries `dryRun` — caller already has it on the payload.
    expect(result).not.toHaveProperty("dryRun");
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

    const result = await runTask({}, 3);

    expect(mockResolveAndPersistEpisodeTopics).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.resolved).toBe(2); // episodes 1 & 3
    // Failure was logged at warn (not info); a single failure does not
    // escalate to error severity.
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "[backfill] per-episode failure",
      expect.objectContaining({ episodeId: 2 }),
    );
  });

  // ── Case 5b: resolver-level topic failures do NOT roll into episode-level `failed` ──

  it("case 5b — resolver returns partial topic failures: episode counted as resolved, not failed", async () => {
    const episodes = [{ id: 50, summary: "Episode summary text." }];
    setupMainPathMock(episodes);

    mockResolveAndPersistEpisodeTopics.mockResolvedValueOnce({
      resolved: 1,
      failed: 2,
      matchMethodDistribution: { auto: 1, llm_disambig: 0, new: 0 },
      versionTokenForcedDisambig: 0,
      candidatesConsidered: { p50: 0, max: 0 },
      budgetExhausted: false,
      topicCount: 3,
    });

    const result = await runTask({}, 1);

    // The episode did not throw, so it counts as one resolved episode.
    // Topic-level resolver failures are logged by the resolver itself and
    // are not surfaced in BackfillResult.failed (ADR-048 §5).
    expect(result.processed).toBe(1);
    expect(result.resolved).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Case 6: episodeIds payload — inArray path with null/length floor guards ─

  it("case 6 — episodeIds path: inArray query with isNotNull + length floor (pinned to 100) asserted in WHERE", async () => {
    const episodes = [
      { id: 42, summary: "Episode 42 summary text that is long enough." },
      { id: 43, summary: "Episode 43 summary text that is long enough." },
    ];

    let capturedWhere: unknown;
    setupEpisodeIdsPathMock(episodes, (w) => {
      capturedWhere = w;
    });

    const result = await runTask({ episodeIds: [42, 43] }, 2);

    // WHERE clause must include inArray, isNotNull, and the length-floor sql
    // guard with the pinned value of BACKFILL_MIN_SUMMARY_LENGTH (100).
    expect(capturedWhere).toMatchObject({
      type: "and",
      conditions: expect.arrayContaining([
        { type: "inArray", col: "episodes.id", vals: [42, 43] },
        { type: "isNotNull", col: "episodes.summary" },
        expect.objectContaining({
          type: "sql",
          values: expect.arrayContaining([BACKFILL_MIN_SUMMARY_LENGTH]),
        }),
      ]),
    });

    expect(mockResolveAndPersistEpisodeTopics).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.failed).toBe(0);
  });

  // ── Case 6b: empty episodeIds is an explicit no-op (does NOT fall through) ─

  it("case 6b — episodeIds: [] returns processed: 0 without hitting the main path", async () => {
    // No db.select mock set up — if the code falls through to the main path,
    // db.select would be called with no return value and the test would crash.
    const result = await runTask({ episodeIds: [] }, 0);

    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockResolveAndPersistEpisodeTopics).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, resolved: 0, failed: 0 });
  });

  // ── Case 7: inter-episode delay ────────────────────────────────────────────

  it("case 7 — inter-episode delay: setTimeout invoked with BACKFILL_INTER_EPISODE_DELAY_MS between episodes", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const episodes = [
      { id: 20, summary: "First timer-test episode summary." },
      { id: 21, summary: "Second timer-test episode summary." },
    ];
    setupMainPathMock(episodes);

    const result = await runTask({}, 2);

    expect(result.processed).toBe(2);
    // Exactly one inter-episode delay between two episodes — the tail delay
    // after the final episode is skipped.
    const inter = setTimeoutSpy.mock.calls.filter(
      ([, ms]) => ms === BACKFILL_INTER_EPISODE_DELAY_MS,
    );
    expect(inter).toHaveLength(1);
  });

  // ── Case 8: NULL/empty summary skip (main path WHERE structure) ────────────

  it("case 8 — NULL/empty summary skip: main-path WHERE has isNull(ect) + isNotNull(summary) + length floor pinned to 100", async () => {
    let capturedWhere: unknown;
    setupMainPathMock([], (w) => {
      capturedWhere = w;
    });

    const result = await runTask({}, 0);

    // The WHERE clause for the main LEFT JOIN path must compose all three
    // guards, and the length floor must be pinned to BACKFILL_MIN_SUMMARY_LENGTH.
    expect(capturedWhere).toMatchObject({
      type: "and",
      conditions: expect.arrayContaining([
        { type: "isNull", col: "ect.episodeId" },
        { type: "isNotNull", col: "episodes.summary" },
        expect.objectContaining({
          type: "sql",
          values: expect.arrayContaining([BACKFILL_MIN_SUMMARY_LENGTH]),
        }),
      ]),
    });

    expect(result.processed).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(0);
  });

  // ── Case 9: batchSize override propagates to .limit() ──────────────────────

  it("case 9 — batchSize override: .limit() invoked with the payload value, not the default", async () => {
    const { limitImpl } = setupMainPathMock([]);

    await runTask({ batchSize: 10 }, 0);

    expect(limitImpl).toHaveBeenCalledWith(10);
    // Sanity: ensure the default isn't being used silently.
    expect(limitImpl).not.toHaveBeenCalledWith(BACKFILL_DEFAULT_BATCH_SIZE);
  });

  // ── Case 10: generateCompletion is called with bounded LLM options ────────

  it("case 10 — generateCompletion options: maxTokens + temperature passed per ADR-048 §2", async () => {
    const episode = { id: 80, summary: "Episode summary for option check." };
    setupMainPathMock([episode]);

    await runTask({}, 1);

    expect(mockGenerateCompletion).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        maxTokens: BACKFILL_MAX_OUTPUT_TOKENS,
        temperature: BACKFILL_TEMPERATURE,
      }),
    );
  });

  // ── Case 11: malformed LLM JSON (non-array topics) coerces to []  ──────────

  it("case 11 — malformed LLM output (topics is a non-array): coerced to [] before normalizeTopics", async () => {
    const episode = { id: 90, summary: "Episode summary for shape guard." };
    setupMainPathMock([episode]);
    mockParseJsonResponse.mockReturnValueOnce({ topics: "not-an-array" });

    const result = await runTask({}, 1);

    expect(mockNormalizeTopics).toHaveBeenCalledWith([], expect.any(Array));
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Case 12: all-failed run escalates final log severity to error ──────────

  it("case 12 — log severity: all-failed run logs at error level", async () => {
    const episodes = [
      { id: 1, summary: "First will fail." },
      { id: 2, summary: "Second will fail." },
    ];
    setupMainPathMock(episodes);
    mockGenerateCompletion.mockRejectedValue(new Error("OpenRouter outage"));

    const result = await runTask({}, 2);

    expect(result.failed).toBe(2);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "[backfill] complete — all episodes failed",
      result,
    );
    expect(mockLoggerInfo).not.toHaveBeenCalledWith(
      "[backfill] complete",
      expect.anything(),
    );
  });

  // ── Case 13: progress metadata is re-set every iteration ──────────────────

  it("case 13 — progress metadata: metadata.set is called per-iteration with full progress shape", async () => {
    const episodes = [
      { id: 1, summary: "First episode summary." },
      { id: 2, summary: "Second episode summary." },
    ];
    setupMainPathMock(episodes);

    await runTask({}, 2);

    // Initial set + one set per processed episode = 3 calls minimum.
    expect(mockMetadataSet).toHaveBeenCalledWith(
      "progress",
      expect.objectContaining({ total: 2, processed: 0 }),
    );
    expect(mockMetadataSet).toHaveBeenCalledWith(
      "progress",
      expect.objectContaining({ total: 2, processed: 2, resolved: 2 }),
    );
    // The buggy increment-on-top-level-key path should not be exercised.
    expect(mockMetadataIncrement).not.toHaveBeenCalled();
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
