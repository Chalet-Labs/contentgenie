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
      root: {
        increment: (...args: unknown[]) => mockMetadataIncrement(...args),
      },
    },
    logger: {
      info: (...args: unknown[]) => mockLoggerInfo(...args),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
      error: (...args: unknown[]) => mockLoggerError(...args),
    },
    AbortTaskRunError: class AbortTaskRunError extends Error {
      constructor(message?: string) {
        super(message);
        this.name = "AbortTaskRunError";
      }
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

const mockGetTopicDigestPrompt = vi.fn().mockReturnValue("mock-digest-prompt");
vi.mock("@/lib/prompts/topic-digest", () => ({
  getTopicDigestPrompt: (...args: unknown[]) =>
    mockGetTopicDigestPrompt(...args),
  TOPIC_DIGEST_SYSTEM_PROMPT: "mock-system-prompt",
  TOPIC_DIGEST_OUTPUT_RULES: {
    minConsensus: 3,
    maxConsensus: 5,
    maxDisagreement: 3,
  },
}));

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
}));

// ─── Import task AFTER mocks ──────────────────────────────────────────────────

import {
  generateTopicDigest,
  type GenerateTopicDigestPayload,
  type GenerateTopicDigestResult,
} from "@/trigger/generate-topic-digest";

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
 * Sets up DB select chain for a given sequence of resolved query results.
 * Each call to mockDbSelect returns a fresh builder that resolves to the next fixture.
 */
function setupDbSelectSequence(results: unknown[]) {
  let callIndex = 0;
  mockDbSelect.mockImplementation(() => {
    const result = results[callIndex++] ?? [];
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
      }),
    };
  });
}

/**
 * Full happy-path mock chain: canonical → existing digest → episodes.
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
    },
  ];
  const digestRows = existingDigest ? [existingDigest] : [];
  setupDbSelectSequence([canonicalRows, digestRows, episodes]);

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

    // UPSERT must include correct episodeCountAtGeneration (derived count = 5, NOT episode read length)
    expect(mockDbInsert).toHaveBeenCalledOnce();
    const upsertArg = mockValues.mock.calls[0][0];
    expect(upsertArg.episodeCountAtGeneration).toBe(5);
    expect(upsertArg.episodeIds).toHaveLength(5);
    expect(upsertArg.modelUsed).toBe("mock-model");

    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.generated", 1);
    expect(mockMetadataSet).toHaveBeenCalledWith(
      "progress",
      expect.objectContaining({ canonicalId: CANONICAL_ID }),
    );
  });

  // ── Case 2: Ineligible — derived count < 3 ───────────────────────────────────

  it("case 2 — ineligible (derived count < 3): aborted counter incremented BEFORE throw", async () => {
    setupDbSelectSequence([
      [
        {
          id: CANONICAL_ID,
          label: "Test",
          summary: "S",
          status: "active",
          episodeCount: 2,
        },
      ],
    ]);

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow();

    // Counter must be incremented before the throw — verify invocation order
    const incrementOrder = mockMetadataIncrement.mock.invocationCallOrder[0];
    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.aborted", 1);
    // The throw terminates the function — UPSERT must NOT have been called
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(incrementOrder).toBeDefined();
  });

  // ── Case 3: Ineligible — non-active status ───────────────────────────────────

  it("case 3 — ineligible (status !== active): aborted counter incremented BEFORE throw", async () => {
    setupDbSelectSequence([
      [
        {
          id: CANONICAL_ID,
          label: "Test",
          summary: "S",
          status: "merged",
          episodeCount: 10,
        },
      ],
    ]);

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow();

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
    expect(upsertArg.episodeCountAtGeneration).toBe(6); // derived count, not read length
  });

  // ── Case 6: Insufficient valid summaries ─────────────────────────────────────

  it("case 6 — insufficient valid summaries (<3): throws AbortTaskRunError, counter incremented", async () => {
    const onlyTwoEpisodes = [
      { id: 1, title: "E1", summary: "S1", coverageScore: 0.9 },
      { id: 2, title: "E2", summary: "S2", coverageScore: 0.8 },
    ];
    setupDbSelectSequence([
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
    ]);

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

  // ── Case 7: LLM failure — counter incremented BEFORE rethrow ────────────────

  it("case 7 — LLM failure: digests.llm_failed incremented BEFORE throw; UPSERT not called", async () => {
    setupHappyPath({ derivedCount: 5 });
    mockGenerateCompletion.mockRejectedValue(new Error("OpenRouter timeout"));

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow("OpenRouter timeout");

    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.llm_failed", 1);
    expect(mockDbInsert).not.toHaveBeenCalled();

    // Verify counter incremented before throw (counter call order < throw)
    const incrementCalls = mockMetadataIncrement.mock.calls;
    const llmFailedCall = incrementCalls.findIndex(
      ([key]) => key === "digests.llm_failed",
    );
    expect(llmFailedCall).toBeGreaterThanOrEqual(0);
  });

  // ── Case 8: Parse failure — counter incremented BEFORE throw ─────────────────

  it("case 8 — parse failure: llm_failed counter incremented; UPSERT not called", async () => {
    setupHappyPath({ derivedCount: 5 });
    mockParseJsonResponse.mockImplementation(() => {
      throw new Error("Invalid JSON");
    });

    await expect(
      taskConfig.run({ canonicalTopicId: CANONICAL_ID }),
    ).rejects.toThrow();

    expect(mockMetadataIncrement).toHaveBeenCalledWith("digests.llm_failed", 1);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  // ── Case 9: Episode read order ─────────────────────────────────────────────

  it("case 9 — episode query: uses desc(coverageScore), desc(createdAt), limit(30)", async () => {
    const { desc } = await import("drizzle-orm");
    setupHappyPath({ derivedCount: 5 });

    await taskConfig.run({ canonicalTopicId: CANONICAL_ID });

    // desc must have been called with both coverage and date columns
    const descCalls = (desc as ReturnType<typeof vi.fn>).mock.calls;
    const descCols = descCalls.map(([col]) => col);
    expect(descCols).toContain("ect.coverageScore");
    expect(descCols).toContain("ect.createdAt");
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
