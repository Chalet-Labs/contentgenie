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

// vi.mock is hoisted — top-level import sees the mocks.
import { resolveAndPersistEpisodeTopics } from "@/trigger/helpers/resolve-topics";
import { EntityResolutionError } from "@/lib/entity-resolution";

// ---- Helpers -----------------------------------------------------------------

function buildEmbedding(seed = 0.001): number[] {
  return Array.from({ length: 1024 }, (_, i) => seed + i * 0.000001);
}

/**
 * Mocks both `generateEmbeddings` calls (identity + context) for an N-topic
 * batch. Returns the embeddings used so tests can re-use them in assertions.
 */
function mockEmbeddings(count: number, seed = 0): number[][] {
  const embs = Array.from({ length: count }, (_, i) =>
    buildEmbedding(seed + (i + 1) * 0.01),
  );
  mockGenerateEmbeddings
    .mockResolvedValueOnce(embs)
    .mockResolvedValueOnce(embs);
  return embs;
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

function makeTopics(count: number, labelPrefix = "T"): NormalizedTopic[] {
  return Array.from({ length: count }, (_, i) =>
    makeTopic({ label: `${labelPrefix}${i}` }),
  );
}

let nextCanonicalId = 1;
function makeResolveResult(
  matchMethod: "auto" | "llm_disambig" | "new",
  overrides: Record<string, unknown> = {},
) {
  const base = {
    canonicalId: nextCanonicalId++,
    aliasesAdded: 0,
    candidatesConsidered: 5,
    versionTokenForcedDisambig: false,
    matchMethod,
    similarityToTopMatch: matchMethod === "new" ? null : 0.95,
    ...overrides,
  };
  return base;
}

function metricCalls(key: string): unknown[][] {
  return mockMetadataRootIncrement.mock.calls.filter(([k]) => k === key);
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
    const result = await resolveAndPersistEpisodeTopics(1, [], "some summary");

    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.topicCount).toBe(0);
    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
    expect(mockResolveTopic).not.toHaveBeenCalled();
  });

  it("returns zero-shape result with no calls when opts.skipResolution is true", async () => {
    const result = await resolveAndPersistEpisodeTopics(
      1,
      [makeTopic()],
      "some summary",
      { skipResolution: true },
    );

    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
    expect(mockResolveTopic).not.toHaveBeenCalled();
  });

  it("makes exactly 2 generateEmbeddings calls regardless of topic count", async () => {
    mockEmbeddings(3);
    mockResolveTopic.mockResolvedValue(makeResolveResult("auto"));

    const result = await resolveAndPersistEpisodeTopics(
      1,
      makeTopics(3),
      "summary",
    );

    expect(mockGenerateEmbeddings).toHaveBeenCalledTimes(2);
    expect(result.resolved).toBe(3);
    expect(result.topicCount).toBe(3);
  });

  it.each([
    {
      name: "label | aliases",
      topic: { label: "Alpha", aliases: ["a", "b"] },
      callIndex: 0,
      expected: "Alpha | a, b",
    },
    {
      name: "label only when aliases empty",
      topic: { label: "NoAlias", aliases: [] },
      callIndex: 0,
      expected: "NoAlias",
    },
    {
      name: "label — summary",
      topic: { label: "Alpha", summary: "alpha is the first" },
      callIndex: 1,
      expected: "Alpha — alpha is the first",
    },
    {
      name: "label only when summary empty",
      topic: { label: "NoSummary", summary: "" },
      callIndex: 1,
      expected: "NoSummary",
    },
  ])("embedding text format: $name", async ({ topic, callIndex, expected }) => {
    mockEmbeddings(1);
    mockResolveTopic.mockResolvedValue(makeResolveResult("auto"));

    await resolveAndPersistEpisodeTopics(1, [makeTopic(topic)], "summary");

    const texts = mockGenerateEmbeddings.mock.calls[callIndex][0] as string[];
    expect(texts[0]).toBe(expected);
  });

  it("per-topic failure increments failed, others succeed, no rethrow", async () => {
    mockEmbeddings(3);
    mockResolveTopic
      .mockResolvedValueOnce(makeResolveResult("auto"))
      .mockRejectedValueOnce(new Error("topic error"))
      .mockResolvedValueOnce(makeResolveResult("auto"));

    const result = await resolveAndPersistEpisodeTopics(
      1,
      makeTopics(3),
      "summary",
    );

    expect(result.resolved).toBe(2);
    expect(result.failed).toBe(1);
  });

  it("budget: topics beyond MAX_DISAMBIG_CALLS_PER_EPISODE use forceInsertNewCanonical", async () => {
    const overflow = 2;
    const total = MAX_DISAMBIG_CALLS_PER_EPISODE + overflow;
    mockEmbeddings(total);

    for (let i = 0; i < MAX_DISAMBIG_CALLS_PER_EPISODE; i++) {
      mockResolveTopic.mockResolvedValueOnce(makeResolveResult("llm_disambig"));
    }
    for (let i = 0; i < overflow; i++) {
      mockForceInsertNewCanonical.mockResolvedValueOnce(
        makeResolveResult("new"),
      );
    }

    const result = await resolveAndPersistEpisodeTopics(
      1,
      makeTopics(total),
      "summary",
    );

    expect(mockResolveTopic).toHaveBeenCalledTimes(
      MAX_DISAMBIG_CALLS_PER_EPISODE,
    );
    expect(mockForceInsertNewCanonical).toHaveBeenCalledTimes(overflow);
    expect(result.budgetExhausted).toBe(true);
    expect(result.matchMethodDistribution.new).toBeGreaterThanOrEqual(overflow);
  });

  it("budget boundary: the cap'th disambig still uses resolveTopic; the next switches to forceInsert", async () => {
    const total = MAX_DISAMBIG_CALLS_PER_EPISODE + 1;
    mockEmbeddings(total);

    for (let i = 0; i < MAX_DISAMBIG_CALLS_PER_EPISODE; i++) {
      mockResolveTopic.mockResolvedValueOnce(makeResolveResult("llm_disambig"));
    }
    mockForceInsertNewCanonical.mockResolvedValueOnce(makeResolveResult("new"));

    await resolveAndPersistEpisodeTopics(1, makeTopics(total), "summary");

    expect(mockResolveTopic).toHaveBeenCalledTimes(
      MAX_DISAMBIG_CALLS_PER_EPISODE,
    );
    expect(mockForceInsertNewCanonical).toHaveBeenCalledTimes(1);
  });

  it("matchMethodDistribution counts each match_method exactly", async () => {
    mockEmbeddings(4);
    mockResolveTopic
      .mockResolvedValueOnce(makeResolveResult("auto"))
      .mockResolvedValueOnce(makeResolveResult("auto"))
      .mockResolvedValueOnce(makeResolveResult("llm_disambig"))
      .mockResolvedValueOnce(makeResolveResult("new"));

    const result = await resolveAndPersistEpisodeTopics(
      1,
      makeTopics(4),
      "summary",
    );

    expect(result.matchMethodDistribution).toEqual({
      auto: 2,
      llm_disambig: 1,
      new: 1,
    });
  });

  it("counts versionTokenForcedDisambig occurrences across topics", async () => {
    mockEmbeddings(3);
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

    const result = await resolveAndPersistEpisodeTopics(
      1,
      makeTopics(3),
      "summary",
    );

    expect(result.versionTokenForcedDisambig).toBe(2);
  });

  it("EntityResolutionError('other_below_relevance_floor') is treated as a skip, not a failure", async () => {
    mockEmbeddings(2);
    mockResolveTopic
      .mockResolvedValueOnce(makeResolveResult("auto"))
      .mockRejectedValueOnce(
        new EntityResolutionError("other_below_relevance_floor"),
      );

    const result = await resolveAndPersistEpisodeTopics(
      1,
      [makeTopic({ label: "Real" }), makeTopic({ label: "Junk" })],
      "summary",
    );

    expect(result.resolved).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.topicCount).toBe(2);
  });

  it("does not call forceInsertNewCanonical when all topics resolve via auto", async () => {
    mockEmbeddings(8);
    mockResolveTopic.mockResolvedValue(makeResolveResult("auto"));

    const result = await resolveAndPersistEpisodeTopics(
      1,
      makeTopics(8),
      "summary",
    );

    expect(mockForceInsertNewCanonical).not.toHaveBeenCalled();
    expect(result.budgetExhausted).toBe(false);
  });

  it("calls metadata.root.increment for topics_resolved and topics_failed once each", async () => {
    mockEmbeddings(2);
    mockResolveTopic
      .mockResolvedValueOnce(makeResolveResult("auto"))
      .mockRejectedValueOnce(new Error("fail"));

    await resolveAndPersistEpisodeTopics(1, makeTopics(2), "summary");

    expect(metricCalls("topics_resolved")).toEqual([["topics_resolved", 1]]);
    expect(metricCalls("topics_failed")).toEqual([["topics_failed", 1]]);
  });

  it("candidatesConsidered.p50 and .max reflect mocked resolver outputs", async () => {
    mockEmbeddings(3);
    for (const candidatesConsidered of [3, 7, 5]) {
      mockResolveTopic.mockResolvedValueOnce(
        makeResolveResult("auto", { candidatesConsidered }),
      );
    }

    const result = await resolveAndPersistEpisodeTopics(
      1,
      makeTopics(3),
      "summary",
    );

    expect(result.candidatesConsidered.max).toBe(7);
    // Median of sorted [3, 5, 7] is 5
    expect(result.candidatesConsidered.p50).toBe(5);
  });

  it("embedding batch failure returns failed=topicCount, resolved=0, increments topics_failed, does not throw", async () => {
    mockGenerateEmbeddings.mockRejectedValue(new Error("embed api down"));

    const result = await resolveAndPersistEpisodeTopics(
      1,
      makeTopics(3),
      "summary",
    );

    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(3);
    expect(result.topicCount).toBe(3);
    expect(mockResolveTopic).not.toHaveBeenCalled();
    expect(metricCalls("topics_failed")).toEqual([["topics_failed", 3]]);
  });
});
