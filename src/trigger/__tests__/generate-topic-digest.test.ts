import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTriggerSdkMock } from "@/test/mocks/trigger-sdk";
import { setupDbSelectSequence } from "@/test/db-select-sequence";

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
      root: {
        increment: (...args: unknown[]) => mockMetadataIncrement(...args),
      },
    },
    logger: {
      info: (...args: unknown[]) => mockLoggerInfo(...args),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
      error: (...args: unknown[]) => mockLoggerError(...args),
    },
  }),
);

// ─── Database mock ─────────────────────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  canonicalTopics: {
    id: "ct.id",
    label: "ct.label",
    summary: "ct.summary",
    status: "ct.status",
  },
  episodeCanonicalTopics: {
    canonicalTopicId: "ect.canonicalTopicId",
    episodeId: "ect.episodeId",
    coverageScore: "ect.coverageScore",
    createdAt: "ect.createdAt",
  },
  episodes: {
    id: "ep.id",
    title: "ep.title",
    summary: "ep.summary",
    summaryStatus: "ep.summaryStatus",
  },
  canonicalTopicDigests: {
    id: "ctd.id",
    canonicalTopicId: "ctd.canonicalTopicId",
    digestMarkdown: "ctd.digestMarkdown",
    consensusPoints: "ctd.consensusPoints",
    disagreementPoints: "ctd.disagreementPoints",
    episodeIds: "ctd.episodeIds",
    episodeCountAtGeneration: "ctd.episodeCountAtGeneration",
    modelUsed: "ctd.modelUsed",
    generatedAt: "ctd.generatedAt",
  },
}));

// ─── Drizzle-ORM tagged stubs ────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
  desc: vi.fn((col: unknown) => ({ type: "desc", col })),
  isNotNull: vi.fn((col: unknown) => ({ type: "isNotNull", col })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: "sql",
    template: Array.isArray(strings) ? Array.from(strings) : strings,
    values,
  })),
}));

// ─── AI / LLM mocks ──────────────────────────────────────────────────────────

const mockGenerateCompletion = vi.fn();
vi.mock("@/lib/ai", () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
}));

const mockParseJsonResponse = vi.fn();
vi.mock("@/lib/openrouter", () => ({
  parseJsonResponse: (...args: unknown[]) => mockParseJsonResponse(...args),
}));

// ─── Prompt mocks ─────────────────────────────────────────────────────────────
//
// We mock `getTopicDigestPrompt` + system prompt constants but pass the REAL
// `topicDigestSchema` (zod) and `TOPIC_DIGEST_OUTPUT_RULES` through, so the
// task's `topicDigestSchema.parse(...)` runs the real validator. The real
// constants module isn't mocked anywhere — we re-export from the source file
// inside the factory so test-time evaluation picks up the actual schema.

const mockGetTopicDigestPrompt = vi.fn().mockReturnValue("mock-digest-prompt");
vi.mock("@/lib/prompts/topic-digest", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/prompts/topic-digest")
  >("@/lib/prompts/topic-digest");
  return {
    ...actual,
    getTopicDigestPrompt: (...args: unknown[]) =>
      mockGetTopicDigestPrompt(...args),
    TOPIC_DIGEST_SYSTEM_PROMPT: "mock-system-prompt",
  };
});

// ─── AI config mock ───────────────────────────────────────────────────────────

const mockGetActiveAiConfig = vi.fn();
vi.mock("@/lib/ai/config", () => ({
  getActiveAiConfig: (...args: unknown[]) => mockGetActiveAiConfig(...args),
}));

// ─── Episode count mock ───────────────────────────────────────────────────────

vi.mock("@/lib/admin/canonical-topic-episode-count", () => ({
  canonicalTopicEpisodeCount: vi.fn(() => ({
    type: "sql",
    template: ["(SELECT count(*)...)"],
    values: [],
  })),
  canonicalTopicCompletedSummaryCount: vi.fn(() => ({
    type: "sql",
    template: ["(SELECT count(*) ... non-blank summary ...)"],
    values: [],
  })),
}));

// ─── Import task AFTER mocks ──────────────────────────────────────────────────

import {
  generateTopicDigest,
  type GenerateTopicDigestPayload,
  type GenerateTopicDigestResult,
} from "@/trigger/generate-topic-digest";
import { MIN_DERIVED_COUNT_FOR_DIGEST } from "@/lib/topic-digest-thresholds";

const taskConfig = generateTopicDigest as unknown as {
  run: (
    payload: GenerateTopicDigestPayload,
  ) => Promise<GenerateTopicDigestResult>;
  id: string;
  queue: { name: string; concurrencyLimit: number };
  maxDuration: number;
  retry: {
    maxAttempts: number;
    factor: number;
    minTimeoutInMs: number;
    maxTimeoutInMs: number;
  };
};

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const CANONICAL_ID = 42;

const VALID_EPISODES = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1,
  title: `Episode ${i + 1}`,
  summary: `Summary for episode ${i + 1}.`,
  coverageScore: 0.9 - i * 0.1,
  createdAt: new Date(2026, 0, i + 1),
}));

const VALID_PARSED = {
  consensus_points: ["Point A", "Point B", "Point C"],
  disagreement_points: ["Disagreement 1"],
  digest_markdown: "This is a non-blank markdown digest.",
};

/**
 * Full happy-path mock chain: canonical → existing digest → episodes.
 *
 * canonical + digest reads use `.where`; episode read uses
 * `.innerJoin().where().orderBy().limit()`.
 */
function setupHappyPath(opts: {
  derivedCount?: number;
  existingDigest?: {
    id: number;
    generatedAt: Date;
    episodeCountAtGeneration: number;
    modelUsed: string;
  } | null;
  episodes?: typeof VALID_EPISODES;
}) {
  const {
    derivedCount = 5,
    existingDigest = null,
    episodes = VALID_EPISODES,
  } = opts;

  const canonicalRows = [
    {
      id: CANONICAL_ID,
      label: "Test Topic",
      summary: "A topic summary.",
      status: "active",
      episodeCount: derivedCount,
      completedSummaryCount: derivedCount,
    },
  ];
  const digestRows = existingDigest ? [existingDigest] : [];
  setupDbSelectSequence(
    mockDbSelect,
    [canonicalRows, digestRows, episodes],
    ["where", "innerJoin"],
  );

  const upsertResult = [{ id: 99 }];
  const mockValues = vi.fn().mockReturnValue({
    onConflictDoUpdate: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(upsertResult),
    }),
  });
  mockDbInsert.mockReturnValue({ values: mockValues });

  return { mockValues };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generate-topic-digest task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveAiConfig.mockResolvedValue({ model: "mock-model" });
    mockGenerateCompletion.mockResolvedValue(
      '{"consensus_points":["A","B","C"],"disagreement_points":["D"],"digest_markdown":"Valid markdown."}',
    );
    mockParseJsonResponse.mockReturnValue(VALID_PARSED);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Case 1: Happy path ───────────────────────────────────────────────────────

  it("case 1 — happy path: active canonical + 5 episodes → UPSERT with correct values", async () => {
    const { mockValues } = setupHappyPath({ derivedCount: 5 });

    const result = await taskConfig.run({ canonicalTopicId: CANONICAL_ID });

    expect(result.status).toBe("generated");
    expect(result.episodeCount).toBe(5);
    expect(result.modelUsed).toBe("mock-model");

    // UPSERT records the uncapped completed-summary count from the canonical
    // projection (`canonicalTopicCompletedSummaryCount`). Storing
    // `episodeRows.length` would saturate at MAX_EPISODE_INPUT and make the
    // action's staleness gate misfire on topics with more digestable summaries
    // than the cap.
    expect(mockDbInsert).toHaveBeenCalledOnce();
    const upsertArg = mockValues.mock.calls[0][0];
    expect(upsertArg.episodeCountAtGeneration).toBe(5);
    expect(upsertArg.episodeIds).toHaveLength(VALID_EPISODES.length);
    expect(upsertArg.modelUsed).toBe("mock-model");

    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.generated", 1);
    expect(mockMetadataSet).toHaveBeenCalledWith(
      "progress",
      expect.objectContaining({ canonicalId: CANONICAL_ID }),
    );
  });

  // ── Case 2: Ineligible — derived count below MIN_DERIVED_COUNT_FOR_DIGEST ──

  it("case 2 — ineligible (derived count below MIN): aborted counter incremented, throw aborts further work", async () => {
    setupDbSelectSequence(
      mockDbSelect,
      [
        [
          {
            id: CANONICAL_ID,
            label: "Test",
            summary: "S",
            status: "active",
            episodeCount: MIN_DERIVED_COUNT_FOR_DIGEST - 1,
          },
        ],
      ],
      ["where", "innerJoin"],
    );

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow();

    // Counter was called before the throw — if the throw came first this would be missing.
    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.aborted", 1);
    // No further work happened after the throw.
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockGenerateCompletion).not.toHaveBeenCalled();
  });

  // ── Case 3: Ineligible — non-active status ───────────────────────────────────

  it("case 3 — ineligible (status !== active): aborted counter incremented, throw aborts further work", async () => {
    setupDbSelectSequence(
      mockDbSelect,
      [
        [
          {
            id: CANONICAL_ID,
            label: "Test",
            summary: "S",
            status: "merged",
            episodeCount: 10,
          },
        ],
      ],
      ["where", "innerJoin"],
    );

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow(/CANONICAL_NOT_ACTIVE/);

    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.aborted", 1);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  // ── Case 4: Rate guard — existing digest < 1h old ───────────────────────────

  it("case 4 — rate guard: existing digest < 1h old → returns rate_guarded, no LLM, no UPSERT", async () => {
    const recentDigest = {
      id: 77,
      generatedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
      episodeCountAtGeneration: 5,
      modelUsed: "old-model",
    };
    setupHappyPath({ derivedCount: 5, existingDigest: recentDigest });

    const result = await taskConfig.run({ canonicalTopicId: CANONICAL_ID });

    expect(result.status).toBe("rate_guarded");
    expect(result.digestId).toBe(77);
    expect(mockGenerateCompletion).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockMetadataIncrement).toHaveBeenCalledWith(
      "digests.rate_guarded",
      1,
    );
  });

  // ── Case 5: Stale — growth >= 3 → regenerates ────────────────────────────────

  it("case 5 — stale (episodeCount growth >= 3): LLM called, UPSERT called with new count", async () => {
    const staleDigest = {
      id: 55,
      generatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3h ago
      episodeCountAtGeneration: 3,
      modelUsed: "old-model",
    };
    const { mockValues } = setupHappyPath({
      derivedCount: 6,
      existingDigest: staleDigest,
    });

    const result = await taskConfig.run({ canonicalTopicId: CANONICAL_ID });

    expect(result.status).toBe("generated");
    expect(mockGenerateCompletion).toHaveBeenCalledOnce();
    const upsertArg = mockValues.mock.calls[0][0];
    // Stored count = uncapped completedSummaryCount from the canonical
    // projection. The fixture sets that to derivedCount (6), so the staleness
    // gate downstream sees the same value the action will read at trigger time.
    expect(upsertArg.episodeCountAtGeneration).toBe(6);
  });

  // ── Case 6: Insufficient valid summaries ─────────────────────────────────────

  it("case 6 — insufficient valid summaries (<MIN): throws AbortTaskRunError, counter incremented, no LLM/UPSERT", async () => {
    const onlyTwoEpisodes = [
      { id: 1, title: "E1", summary: "S1", coverageScore: 0.9 },
      { id: 2, title: "E2", summary: "S2", coverageScore: 0.8 },
    ];
    setupDbSelectSequence(
      mockDbSelect,
      [
        [
          {
            id: CANONICAL_ID,
            label: "T",
            summary: "S",
            status: "active",
            episodeCount: 10,
          },
        ],
        [], // no existing digest
        onlyTwoEpisodes,
      ],
      ["where", "innerJoin"],
    );

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow();

    expect(mockMetadataIncrement).toHaveBeenCalledWith(
      "digests.insufficient_summaries",
      1,
    );
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockGenerateCompletion).not.toHaveBeenCalled();
  });

  // ── Case 7: LLM failure — counter incremented AFTER LLM call, BEFORE rethrow

  it("case 7 — LLM failure: digests.llm_failed incremented in catch (after LLM call); UPSERT not called", async () => {
    setupHappyPath({ derivedCount: 5 });
    mockGenerateCompletion.mockRejectedValue(new Error("OpenRouter timeout"));

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow("OpenRouter timeout");

    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.llm_failed", 1);
    expect(mockDbInsert).not.toHaveBeenCalled();

    // Real ordering pin: counter was called AFTER the LLM call, proving it ran in catch (not pre-emptively).
    const completionOrder = mockGenerateCompletion.mock.invocationCallOrder[0];
    const incrementCalls = mockMetadataIncrement.mock.calls;
    const llmFailedCallIdx = incrementCalls.findIndex(
      (c) => c[0] === "digests.llm_failed",
    );
    expect(llmFailedCallIdx).toBeGreaterThanOrEqual(0);
    const llmFailedCallOrder =
      mockMetadataIncrement.mock.invocationCallOrder[llmFailedCallIdx];
    expect(llmFailedCallOrder).toBeGreaterThan(completionOrder);
  });

  // ── Case 8: Parse failure — counter incremented BEFORE throw ─────────────────

  it("case 8 — parse failure: llm_failed counter incremented after LLM call; UPSERT not called", async () => {
    setupHappyPath({ derivedCount: 5 });
    mockParseJsonResponse.mockImplementation(() => {
      throw new Error("Invalid JSON");
    });

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow();

    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.llm_failed", 1);
    expect(mockDbInsert).not.toHaveBeenCalled();

    // Counter ran AFTER the LLM completed (proving catch path, not pre-emptive).
    const completionOrder = mockGenerateCompletion.mock.invocationCallOrder[0];
    const incrementCalls = mockMetadataIncrement.mock.calls;
    const llmFailedCallIdx = incrementCalls.findIndex(
      (c) => c[0] === "digests.llm_failed",
    );
    expect(llmFailedCallIdx).toBeGreaterThanOrEqual(0);
    const llmFailedCallOrder =
      mockMetadataIncrement.mock.invocationCallOrder[llmFailedCallIdx];
    expect(llmFailedCallOrder).toBeGreaterThan(completionOrder);
  });

  // ── Case 8b–8d: Zod schema rejection branches ─────────────────────────────

  it("case 8b — schema reject (empty consensus_points): llm_failed counter; no UPSERT", async () => {
    setupHappyPath({ derivedCount: 5 });
    mockParseJsonResponse.mockReturnValue({
      consensus_points: [],
      disagreement_points: [],
      digest_markdown: "Some markdown.",
    });

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow();

    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.llm_failed", 1);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("case 8c — schema reject (blank digest_markdown): llm_failed counter; no UPSERT", async () => {
    setupHappyPath({ derivedCount: 5 });
    mockParseJsonResponse.mockReturnValue({
      consensus_points: ["A", "B", "C"],
      disagreement_points: [],
      digest_markdown: "",
    });

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow();

    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.llm_failed", 1);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("case 8d — schema reject (over-max consensus_points length 6): llm_failed counter; no UPSERT", async () => {
    setupHappyPath({ derivedCount: 5 });
    mockParseJsonResponse.mockReturnValue({
      consensus_points: ["A", "B", "C", "D", "E", "F"],
      disagreement_points: [],
      digest_markdown: "Some markdown.",
    });

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow();

    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.llm_failed", 1);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  // ── Case 9: Episode read order + limit pinning ─────────────────────────────

  it("case 9 — episode query: uses desc(coverageScore), desc(createdAt), limit(30)", async () => {
    const { desc, eq } = await import("drizzle-orm");

    // Wire a mock chain where we can spy on `.limit`.
    const limitMock = vi.fn().mockResolvedValue(VALID_EPISODES);
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const whereInnerMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    const innerJoinMock = vi.fn().mockReturnValue({ where: whereInnerMock });

    let callIndex = 0;
    const fixtureSequence: unknown[] = [
      [
        {
          id: CANONICAL_ID,
          label: "Test Topic",
          summary: "A topic summary.",
          status: "active",
          episodeCount: 5,
          completedSummaryCount: 5,
        },
      ],
      [], // no existing digest
      VALID_EPISODES,
    ];

    mockDbSelect.mockImplementation(() => {
      const result = fixtureSequence[callIndex++] ?? [];
      const isEpisodeRead = callIndex === 3;
      return {
        from: vi.fn().mockReturnValue(
          isEpisodeRead
            ? { innerJoin: innerJoinMock }
            : {
                where: vi.fn().mockResolvedValue(result),
              },
        ),
      };
    });

    const upsertResult = [{ id: 99 }];
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(upsertResult),
        }),
      }),
    });

    await taskConfig.run({ canonicalTopicId: CANONICAL_ID });

    // desc must have been called with both coverage and date columns
    const descCalls = (desc as ReturnType<typeof vi.fn>).mock.calls;
    const descCols = descCalls.map(([col]) => col);
    expect(descCols).toContain("ect.coverageScore");
    expect(descCols).toContain("ect.createdAt");

    // limit(30) is the read cap — verify the magic number is wired.
    expect(limitMock).toHaveBeenCalledWith(30);

    // summaryStatus = "completed" filter must be in the episode query.
    const eqCalls = (eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls).toEqual(
      expect.arrayContaining([["ep.summaryStatus", "completed"]]),
    );
  });

  // ── Case 10: Task config ────────────────────────────────────────────────────

  it("task config: id, queue, concurrencyLimit, maxDuration, retry", () => {
    const config = generateTopicDigest as unknown as {
      id: string;
      queue: { name: string; concurrencyLimit: number };
      maxDuration: number;
      retry: {
        maxAttempts: number;
        factor: number;
        minTimeoutInMs: number;
        maxTimeoutInMs: number;
      };
    };
    expect(config.id).toBe("generate-topic-digest");
    expect(config.queue.name).toBe("topic-digest-queue");
    expect(config.queue.concurrencyLimit).toBe(3);
    expect(config.maxDuration).toBe(120);
    expect(config.retry.maxAttempts).toBe(3);
    expect(config.retry.factor).toBe(2);
    expect(config.retry.minTimeoutInMs).toBe(1000);
    expect(config.retry.maxTimeoutInMs).toBe(30000);
  });
});
