// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedTopic } from "@/lib/openrouter";
import { MAX_DISAMBIG_CALLS_PER_EPISODE } from "@/lib/entity-resolution-constants";

// ---- Mocks ------------------------------------------------------------------

const mockResolveTopic = vi.fn();
vi.mock("@/lib/entity-resolution", () => ({
  resolveTopic: (...args: unknown[]) => mockResolveTopic(...args),
  EntityResolutionError: class EntityResolutionError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  },
  normalizeLabel: (s: string) => s.trim().toLowerCase(),
}));

const mockGenerateEmbeddings = vi.fn();
vi.mock("@/lib/ai/embed", () => ({
  generateEmbeddings: (...args: unknown[]) => mockGenerateEmbeddings(...args),
}));

const mockForceInsertNewCanonical = vi.fn();
vi.mock("@/trigger/helpers/database", () => ({
  forceInsertNewCanonical: (...args: unknown[]) =>
    mockForceInsertNewCanonical(...args),
  // Stub other exports so the module resolves cleanly
  trackEpisodeRun: vi.fn(),
  persistEpisodeSummary: vi.fn(),
  updateEpisodeStatus: vi.fn(),
  addAliasIfNew: vi.fn(),
}));

const mockMetadataRootIncrement = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({
  metadata: {
    root: {
      increment: (...args: unknown[]) => mockMetadataRootIncrement(...args),
    },
  },
  logger: { info: vi.fn(), warn: vi.fn() },
}));

// ---- Helpers -----------------------------------------------------------------

function buildEmbedding(seed = 0.001): number[] {
  return Array.from({ length: 1024 }, (_, i) => seed + i * 0.000001);
}

function makeTopic(overrides: Partial<NormalizedTopic> = {}): NormalizedTopic {
  return {
    label: "Test Topic",
    kind: "concept",
    summary: "A topic about testing.",
    aliases: [],
    ongoing: false,
    relevance: 0.8,
    coverageScore: 0.6,
    ...overrides,
  };
}

function makeResolveResult(
  matchMethod: "auto" | "llm_disambig" | "new",
  overrides: Record<string, unknown> = {},
) {
  const base = {
    canonicalId: Math.floor(Math.random() * 1000) + 1,
    aliasesAdded: 0,
    candidatesConsidered: 5,
    versionTokenForcedDisambig: false,
    matchMethod,
    similarityToTopMatch: matchMethod === "new" ? null : 0.95,
    ...overrides,
  };
  return base;
}

// ---- Tests ------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveAndPersistEpisodeTopics", () => {
  it("returns zero-shape result with no calls when topics is empty", async () => {
    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const result = await resolveAndPersistEpisodeTopics(1, [], "some summary");

    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.topicCount).toBe(0);
    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
    expect(mockResolveTopic).not.toHaveBeenCalled();
  });

  it("returns zero-shape result with no calls when opts.skipResolution is true", async () => {
    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const topics = [makeTopic()];
    const result = await resolveAndPersistEpisodeTopics(
      1,
      topics,
      "some summary",
      { skipResolution: true },
    );

    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
    expect(mockResolveTopic).not.toHaveBeenCalled();
  });

  it("makes exactly 2 generateEmbeddings calls for 3 topics (one per column)", async () => {
    const identityEmbeddings = [
      buildEmbedding(0.1),
      buildEmbedding(0.2),
      buildEmbedding(0.3),
    ];
    const contextEmbeddings = [
      buildEmbedding(0.4),
      buildEmbedding(0.5),
      buildEmbedding(0.6),
    ];
    mockGenerateEmbeddings
      .mockResolvedValueOnce(identityEmbeddings)
      .mockResolvedValueOnce(contextEmbeddings);
    mockResolveTopic.mockResolvedValue(makeResolveResult("auto"));

    const topics = [
      makeTopic({ label: "Alpha", aliases: ["a"] }),
      makeTopic({ label: "Beta" }),
      makeTopic({ label: "Gamma", summary: "gamma summary" }),
    ];

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const result = await resolveAndPersistEpisodeTopics(1, topics, "summary");

    expect(mockGenerateEmbeddings).toHaveBeenCalledTimes(2);
    expect(result.resolved).toBe(3);
    expect(result.topicCount).toBe(3);
  });

  it("passes correct identity text (label | aliases) to first generateEmbeddings call", async () => {
    mockGenerateEmbeddings
      .mockResolvedValueOnce([buildEmbedding()])
      .mockResolvedValueOnce([buildEmbedding()]);
    mockResolveTopic.mockResolvedValue(makeResolveResult("auto"));

    const topic = makeTopic({ label: "Alpha", aliases: ["a", "b"] });

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    await resolveAndPersistEpisodeTopics(1, [topic], "summary");

    const identityTexts = mockGenerateEmbeddings.mock.calls[0][0] as string[];
    expect(identityTexts[0]).toBe("Alpha | a, b");
  });

  it("uses just label as identity text when aliases is empty", async () => {
    mockGenerateEmbeddings
      .mockResolvedValueOnce([buildEmbedding()])
      .mockResolvedValueOnce([buildEmbedding()]);
    mockResolveTopic.mockResolvedValue(makeResolveResult("auto"));

    const topic = makeTopic({ label: "NoAlias", aliases: [] });

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    await resolveAndPersistEpisodeTopics(1, [topic], "summary");

    const identityTexts = mockGenerateEmbeddings.mock.calls[0][0] as string[];
    expect(identityTexts[0]).toBe("NoAlias");
  });

  it("passes correct context text (label — summary) to second generateEmbeddings call", async () => {
    mockGenerateEmbeddings
      .mockResolvedValueOnce([buildEmbedding()])
      .mockResolvedValueOnce([buildEmbedding()]);
    mockResolveTopic.mockResolvedValue(makeResolveResult("auto"));

    const topic = makeTopic({ label: "Alpha", summary: "alpha is the first" });

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    await resolveAndPersistEpisodeTopics(1, [topic], "summary");

    const contextTexts = mockGenerateEmbeddings.mock.calls[1][0] as string[];
    expect(contextTexts[0]).toBe("Alpha — alpha is the first");
  });

  it("uses just label as context text when summary is empty", async () => {
    mockGenerateEmbeddings
      .mockResolvedValueOnce([buildEmbedding()])
      .mockResolvedValueOnce([buildEmbedding()]);
    mockResolveTopic.mockResolvedValue(makeResolveResult("auto"));

    const topic = makeTopic({ label: "NoSummary", summary: "" });

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    await resolveAndPersistEpisodeTopics(1, [topic], "summary");

    const contextTexts = mockGenerateEmbeddings.mock.calls[1][0] as string[];
    expect(contextTexts[0]).toBe("NoSummary");
  });

  it("per-topic failure increments failed, others succeed, no rethrow", async () => {
    const emb = [buildEmbedding(), buildEmbedding(), buildEmbedding()];
    mockGenerateEmbeddings
      .mockResolvedValueOnce(emb)
      .mockResolvedValueOnce(emb);

    mockResolveTopic
      .mockResolvedValueOnce(makeResolveResult("auto"))
      .mockRejectedValueOnce(new Error("topic error"))
      .mockResolvedValueOnce(makeResolveResult("auto"));

    const topics = [
      makeTopic(),
      makeTopic({ label: "Failing" }),
      makeTopic({ label: "Third" }),
    ];

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const result = await resolveAndPersistEpisodeTopics(1, topics, "summary");

    expect(result.resolved).toBe(2);
    expect(result.failed).toBe(1);
  });

  it("budget: topics beyond MAX_DISAMBIG_CALLS_PER_EPISODE use forceInsertNewCanonical", async () => {
    const overflow = 2;
    const total = MAX_DISAMBIG_CALLS_PER_EPISODE + overflow;
    const embs = Array.from({ length: total }, (_, i) =>
      buildEmbedding(i * 0.01 + 0.01),
    );
    mockGenerateEmbeddings
      .mockResolvedValueOnce(embs)
      .mockResolvedValueOnce(embs);

    // First MAX_DISAMBIG_CALLS_PER_EPISODE topics → llm_disambig (burns budget)
    const llmResult = makeResolveResult("llm_disambig");
    for (let i = 0; i < MAX_DISAMBIG_CALLS_PER_EPISODE; i++) {
      mockResolveTopic.mockResolvedValueOnce(llmResult);
    }

    // Remaining topics → forceInsertNewCanonical
    const forceResult = makeResolveResult("new");
    for (let i = 0; i < overflow; i++) {
      mockForceInsertNewCanonical.mockResolvedValueOnce(forceResult);
    }

    const topics = Array.from({ length: total }, (_, i) =>
      makeTopic({ label: `Topic ${i + 1}` }),
    );

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const result = await resolveAndPersistEpisodeTopics(1, topics, "summary");

    expect(mockResolveTopic).toHaveBeenCalledTimes(
      MAX_DISAMBIG_CALLS_PER_EPISODE,
    );
    expect(mockForceInsertNewCanonical).toHaveBeenCalledTimes(overflow);
    expect(result.budgetExhausted).toBe(true);
    expect(result.matchMethodDistribution.new).toBeGreaterThanOrEqual(overflow);
  });

  it("budget boundary: the cap'th disambig still uses resolveTopic; the next switches to forceInsert", async () => {
    const total = MAX_DISAMBIG_CALLS_PER_EPISODE + 1;
    const embs = Array.from({ length: total }, () => buildEmbedding());
    mockGenerateEmbeddings
      .mockResolvedValueOnce(embs)
      .mockResolvedValueOnce(embs);

    for (let i = 0; i < MAX_DISAMBIG_CALLS_PER_EPISODE; i++) {
      mockResolveTopic.mockResolvedValueOnce(makeResolveResult("llm_disambig"));
    }
    mockForceInsertNewCanonical.mockResolvedValueOnce(makeResolveResult("new"));

    const topics = Array.from({ length: total }, (_, i) =>
      makeTopic({ label: `T${i}` }),
    );

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    await resolveAndPersistEpisodeTopics(1, topics, "summary");

    expect(mockResolveTopic).toHaveBeenCalledTimes(
      MAX_DISAMBIG_CALLS_PER_EPISODE,
    );
    expect(mockForceInsertNewCanonical).toHaveBeenCalledTimes(1);
  });

  it("matchMethodDistribution counts each match_method exactly", async () => {
    const embs = [
      buildEmbedding(),
      buildEmbedding(),
      buildEmbedding(),
      buildEmbedding(),
    ];
    mockGenerateEmbeddings
      .mockResolvedValueOnce(embs)
      .mockResolvedValueOnce(embs);
    mockResolveTopic
      .mockResolvedValueOnce(makeResolveResult("auto"))
      .mockResolvedValueOnce(makeResolveResult("auto"))
      .mockResolvedValueOnce(makeResolveResult("llm_disambig"))
      .mockResolvedValueOnce(makeResolveResult("new"));

    const topics = Array.from({ length: 4 }, (_, i) =>
      makeTopic({ label: `T${i}` }),
    );

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const result = await resolveAndPersistEpisodeTopics(1, topics, "summary");

    expect(result.matchMethodDistribution).toEqual({
      auto: 2,
      llm_disambig: 1,
      new: 1,
    });
  });

  it("counts versionTokenForcedDisambig occurrences across topics", async () => {
    const embs = [buildEmbedding(), buildEmbedding(), buildEmbedding()];
    mockGenerateEmbeddings
      .mockResolvedValueOnce(embs)
      .mockResolvedValueOnce(embs);
    mockResolveTopic
      .mockResolvedValueOnce(
        makeResolveResult("llm_disambig", { versionTokenForcedDisambig: true }),
      )
      .mockResolvedValueOnce(
        makeResolveResult("auto", { versionTokenForcedDisambig: false }),
      )
      .mockResolvedValueOnce(
        makeResolveResult("llm_disambig", { versionTokenForcedDisambig: true }),
      );

    const topics = Array.from({ length: 3 }, (_, i) =>
      makeTopic({ label: `T${i}` }),
    );

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const result = await resolveAndPersistEpisodeTopics(1, topics, "summary");

    expect(result.versionTokenForcedDisambig).toBe(2);
  });

  it("EntityResolutionError('other_below_relevance_floor') is treated as a skip, not a failure", async () => {
    const embs = [buildEmbedding(), buildEmbedding()];
    mockGenerateEmbeddings
      .mockResolvedValueOnce(embs)
      .mockResolvedValueOnce(embs);

    const { EntityResolutionError } = await import("@/lib/entity-resolution");
    mockResolveTopic
      .mockResolvedValueOnce(makeResolveResult("auto"))
      .mockRejectedValueOnce(
        new (EntityResolutionError as unknown as new (reason: string) => Error)(
          "other_below_relevance_floor",
        ),
      );

    const topics = [makeTopic({ label: "Real" }), makeTopic({ label: "Junk" })];

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const result = await resolveAndPersistEpisodeTopics(1, topics, "summary");

    expect(result.resolved).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.topicCount).toBe(2);
  });

  it("does not call forceInsertNewCanonical when all topics resolve via auto", async () => {
    const embs = Array.from({ length: 8 }, (_, i) =>
      buildEmbedding(i * 0.01 + 0.01),
    );
    mockGenerateEmbeddings
      .mockResolvedValueOnce(embs)
      .mockResolvedValueOnce(embs);

    mockResolveTopic.mockResolvedValue(makeResolveResult("auto"));

    const topics = Array.from({ length: 8 }, (_, i) =>
      makeTopic({ label: `Topic ${i + 1}` }),
    );

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const result = await resolveAndPersistEpisodeTopics(1, topics, "summary");

    expect(mockForceInsertNewCanonical).not.toHaveBeenCalled();
    expect(result.budgetExhausted).toBe(false);
  });

  it("calls metadata.root.increment for topics_resolved and topics_failed once each", async () => {
    const embs = [buildEmbedding(), buildEmbedding()];
    mockGenerateEmbeddings
      .mockResolvedValueOnce(embs)
      .mockResolvedValueOnce(embs);
    mockResolveTopic
      .mockResolvedValueOnce(makeResolveResult("auto"))
      .mockRejectedValueOnce(new Error("fail"));

    const topics = [makeTopic(), makeTopic({ label: "Fail" })];

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    await resolveAndPersistEpisodeTopics(1, topics, "summary");

    const resolvedCalls = mockMetadataRootIncrement.mock.calls.filter(
      ([key]) => key === "topics_resolved",
    );
    const failedCalls = mockMetadataRootIncrement.mock.calls.filter(
      ([key]) => key === "topics_failed",
    );
    expect(resolvedCalls).toHaveLength(1);
    expect(resolvedCalls[0]).toEqual(["topics_resolved", 1]);
    expect(failedCalls).toHaveLength(1);
    expect(failedCalls[0]).toEqual(["topics_failed", 1]);
  });

  it("candidatesConsidered.p50 and .max reflect mocked resolver outputs", async () => {
    const embs = [buildEmbedding(), buildEmbedding(), buildEmbedding()];
    mockGenerateEmbeddings
      .mockResolvedValueOnce(embs)
      .mockResolvedValueOnce(embs);

    mockResolveTopic
      .mockResolvedValueOnce(
        makeResolveResult("auto", { candidatesConsidered: 3 }),
      )
      .mockResolvedValueOnce(
        makeResolveResult("auto", { candidatesConsidered: 7 }),
      )
      .mockResolvedValueOnce(
        makeResolveResult("auto", { candidatesConsidered: 5 }),
      );

    const topics = Array.from({ length: 3 }, (_, i) =>
      makeTopic({ label: `T${i}` }),
    );

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const result = await resolveAndPersistEpisodeTopics(1, topics, "summary");

    expect(result.candidatesConsidered.max).toBe(7);
    // Median of [3, 7, 5] sorted → [3, 5, 7]; p50 = 5
    expect(result.candidatesConsidered.p50).toBe(5);
  });

  it("embedding batch failure returns failed=topicCount, resolved=0, increments topics_failed, does not throw", async () => {
    mockGenerateEmbeddings.mockRejectedValue(new Error("embed api down"));

    const topics = [
      makeTopic({ label: "A" }),
      makeTopic({ label: "B" }),
      makeTopic({ label: "C" }),
    ];

    const { resolveAndPersistEpisodeTopics } =
      await import("@/trigger/helpers/resolve-topics");
    const result = await resolveAndPersistEpisodeTopics(1, topics, "summary");

    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(3);
    expect(result.topicCount).toBe(3);
    expect(mockResolveTopic).not.toHaveBeenCalled();

    const failedCalls = mockMetadataRootIncrement.mock.calls.filter(
      ([key]) => key === "topics_failed",
    );
    expect(failedCalls).toHaveLength(1);
    expect(failedCalls[0]).toEqual(["topics_failed", 3]);
  });
});
