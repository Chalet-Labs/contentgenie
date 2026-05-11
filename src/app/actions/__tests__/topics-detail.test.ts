import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Auth mock (hoisted to avoid TDZ) ────────────────────────────────────────

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/auth-roles", () => ({ ADMIN_ROLE: "org:admin" }));

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbExecute = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    execute: (...args: unknown[]) => mockDbExecute(...args),
  },
}));

// ─── Schema mock ──────────────────────────────────────────────────────────────

vi.mock("@/db/schema", () => ({
  canonicalTopics: {
    id: "ct.id",
    label: "ct.label",
    kind: "ct.kind",
    status: "ct.status",
    summary: "ct.summary",
    identityEmbedding: "ct.identityEmbedding",
  },
  canonicalTopicDigests: {
    id: "ctd.id",
    canonicalTopicId: "ctd.canonicalTopicId",
    digestMarkdown: "ctd.digestMarkdown",
    consensusPoints: "ctd.consensusPoints",
    disagreementPoints: "ctd.disagreementPoints",
    episodeCountAtGeneration: "ctd.episodeCountAtGeneration",
    modelUsed: "ctd.modelUsed",
    generatedAt: "ctd.generatedAt",
  },
  episodes: {
    id: "episodes.id",
    podcastId: "episodes.podcastId",
    podcastIndexId: "episodes.podcastIndexId",
    title: "episodes.title",
  },
  podcasts: {
    id: "podcasts.id",
    podcastIndexId: "podcasts.podcastIndexId",
    title: "podcasts.title",
  },
  episodeCanonicalTopics: {
    id: "ect.id",
    canonicalTopicId: "ect.canonicalTopicId",
    episodeId: "ect.episodeId",
    coverageScore: "ect.coverageScore",
    createdAt: "ect.createdAt",
  },
  listenHistory: {
    id: "listen_history.id",
    userId: "listen_history.userId",
    episodeId: "listen_history.episodeId",
    completedAt: "listen_history.completedAt",
  },
  userLibrary: {
    id: "user_library.id",
    userId: "user_library.userId",
    episodeId: "user_library.episodeId",
  },
  canonicalTopicStatusEnum: { enumValues: ["active", "merged", "dormant"] },
  canonicalTopicKindEnum: {
    enumValues: [
      "release",
      "incident",
      "regulation",
      "announcement",
      "deal",
      "event",
      "concept",
      "work",
      "other",
    ],
  },
  canonicalTopicAliases: {},
  IN_PROGRESS_STATUSES: [],
}));

// ─── Drizzle-ORM stubs ────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
  isNull: vi.fn((col: unknown) => ({ type: "isNull", col })),
  isNotNull: vi.fn((col: unknown) => ({ type: "isNotNull", col })),
  desc: vi.fn((col: unknown) => ({ type: "desc", col })),
  ne: vi.fn((col: unknown, val: unknown) => ({ type: "ne", col, val })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: "sql",
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ type: "sql.raw", value: s }),
      join: (parts: unknown[], sep: unknown) => ({
        type: "sql.join",
        parts,
        sep,
      }),
    },
  ),
}));

// ─── Trigger SDK mock ─────────────────────────────────────────────────────────

const mockTasksTrigger = vi.fn();
const mockCreatePublicToken = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: (...args: unknown[]) => mockTasksTrigger(...args) },
  auth: {
    createPublicToken: (...args: unknown[]) => mockCreatePublicToken(...args),
  },
}));

// ─── Episode count helpers ───────────────────────────────────────────────────

vi.mock("@/lib/admin/canonical-topic-episode-count", () => ({
  canonicalTopicEpisodeCount: vi.fn(() => ({
    type: "sql",
    template: ["(SELECT count(*)...)"],
    values: [],
  })),
  canonicalTopicCompletedSummaryCount: vi.fn(() => ({
    type: "sql",
    template: ["(SELECT count(*) ... summary_status='completed' ...)"],
    values: [],
  })),
}));

// ─── No-op mocks for unrelated topics.ts imports ─────────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/trigger/helpers/database", () => ({
  mergeCanonicals: vi.fn(),
  unmergeCanonicals: vi.fn(),
}));
vi.mock("@/lib/admin/topic-queries", () => ({
  getCanonicalTopicsListQuery: vi.fn(),
  getAdminAuditLogQuery: vi.fn(),
  getUnmergeSuggestionsQuery: vi.fn(),
  getCanonicalMergeCleanupDriftQuery: vi.fn(),
  getLinkedEpisodesForTopicQuery: vi.fn(),
}));
vi.mock("@/trigger/generate-topic-digest", () => ({
  generateTopicDigest: {},
}));
vi.mock("@/trigger/summarize-episode", () => ({ summarizeEpisode: {} }));

// ─── Imports under test ──────────────────────────────────────────────────────

import {
  getTopicDetailData,
  triggerTopicDigestRefresh,
} from "@/app/actions/topics";
import {
  MIN_DERIVED_COUNT_FOR_DIGEST,
  STALENESS_GROWTH_THRESHOLD,
  RELATED_TOPICS_LIMIT,
} from "@/lib/topic-digest-thresholds";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function makeAuth(userId = "user_1") {
  return { userId, has: vi.fn().mockReturnValue(false) };
}
function makeAnonAuth() {
  return { userId: null, has: vi.fn() };
}

// ─── Chain-builder helpers ───────────────────────────────────────────────────

interface ChainConfig {
  /** Resolves on `.where(...)`. */
  where?: unknown;
  /** Resolves on `.where(...).orderBy(...)`. */
  whereOrderBy?: unknown;
  /** Resolves on `.innerJoin(...).leftJoin(...).leftJoin(...).where(...).orderBy(...)`. */
  joinedWhereOrderBy?: unknown;
}

function makeChain(config: ChainConfig) {
  const fromObj: Record<string, unknown> = {};

  if (config.where !== undefined) {
    fromObj.where = vi.fn().mockResolvedValue(config.where);
  }

  if (config.whereOrderBy !== undefined) {
    fromObj.where = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue(config.whereOrderBy),
    });
  }

  if (config.joinedWhereOrderBy !== undefined) {
    fromObj.innerJoin = vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(config.joinedWhereOrderBy),
            }),
          }),
        }),
      }),
    });
  }

  return { from: vi.fn().mockReturnValue(fromObj) };
}

// Each call to db.select() consumes the next chain config in order.
function setupSelectChains(configs: ChainConfig[]) {
  let i = 0;
  mockDbSelect.mockImplementation(() => makeChain(configs[i++] ?? {}));
}

function makeCanonicalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    label: "T",
    kind: "concept",
    status: "active",
    summary: "S",
    episodeCount: 3,
    completedSummaryCount: 3,
    identityEmbedding: "[0.1,0.2]",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(makeAuth());
});

describe("getTopicDetailData", () => {
  // ── Case: Unauthenticated ──────────────────────────────────────────────────

  it("returns Unauthorized without a session", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await getTopicDetailData({ canonicalTopicId: 1 });
    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  // ── Case: Zod validation rejects bad ids ───────────────────────────────────

  it.each([0, -1, 1.5, Number.NaN])(
    "rejects invalid canonicalTopicId %s",
    async (id) => {
      const result = await getTopicDetailData({ canonicalTopicId: id });
      expect(result).toMatchObject({ success: false });
      expect(mockDbSelect).not.toHaveBeenCalled();
    },
  );

  // ── Case: Canonical not found ──────────────────────────────────────────────

  it("returns not-found when canonical row missing", async () => {
    setupSelectChains([{ where: [] }]);
    const result = await getTopicDetailData({ canonicalTopicId: 99 });
    expect(result).toEqual({ success: false, error: "not-found" });
  });

  // ── Case: Merged canonical → not-found (page handles redirect) ────────────

  it("returns not-found when canonical is merged (redirect is page's job)", async () => {
    setupSelectChains([
      {
        where: [
          makeCanonicalRow({
            status: "merged",
            episodeCount: 5,
            completedSummaryCount: 4,
          }),
        ],
      },
    ]);
    const result = await getTopicDetailData({ canonicalTopicId: 5 });
    expect(result).toEqual({ success: false, error: "not-found" });
  });

  // ── Case: happy path returns canonical, digest, episodes, relatedTopics ────

  it("returns full payload with episodes sorted by coverageScore DESC, joinedAt DESC", async () => {
    const canonical = {
      id: 5,
      label: "Topic",
      kind: "concept",
      status: "active",
      summary: "Summary text",
      episodeCount: 6,
      completedSummaryCount: 4,
      identityEmbedding: "[0.1,0.2,0.3]",
    };
    const digestRow = {
      id: 22,
      digestMarkdown: "# heading",
      consensusPoints: ["c1", "c2"],
      disagreementPoints: ["d1"],
      episodeCountAtGeneration: 4,
      modelUsed: "gpt-x",
      generatedAt: new Date("2026-05-01T00:00:00Z"),
    };
    const episodeRows = [
      {
        id: 101,
        podcastIndexEpisodeId: "p1",
        title: "Ep one",
        podcastTitle: "Pod A",
        podcastFeedId: "7001",
        coverageScore: 0.92,
        listenId: 999,
        libraryId: null,
      },
      {
        id: 102,
        podcastIndexEpisodeId: "p2",
        title: "Ep two",
        podcastTitle: "Pod A",
        podcastFeedId: "7001",
        coverageScore: 0.71,
        listenId: null,
        libraryId: 5555,
      },
      {
        id: 103,
        podcastIndexEpisodeId: "p3",
        title: "Ep three",
        podcastTitle: "Pod B",
        podcastFeedId: "7002",
        coverageScore: 0.55,
        listenId: null,
        libraryId: null,
      },
    ];

    setupSelectChains([
      { where: [canonical] }, // canonical
      { where: [digestRow] }, // digest
      { joinedWhereOrderBy: episodeRows }, // episodes
    ]);
    mockDbExecute.mockResolvedValue({
      rows: [
        { id: 8, label: "Related A", kind: "concept" },
        { id: 9, label: "Related B", kind: "work" },
      ],
    });

    const result = await getTopicDetailData({ canonicalTopicId: 5 });
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("expected success");

    expect(result.data.canonical).toMatchObject({
      id: 5,
      label: "Topic",
      kind: "concept",
      status: "active",
      summary: "Summary text",
      episodeCount: 6,
      completedSummaryCount: 4,
    });

    expect(result.data.digest).toMatchObject({
      id: 22,
      digestMarkdown: "# heading",
      consensusPoints: ["c1", "c2"],
      disagreementPoints: ["d1"],
      episodeCountAtGeneration: 4,
      modelUsed: "gpt-x",
    });

    expect(result.data.episodes).toHaveLength(3);
    expect(result.data.episodes[0]).toMatchObject({
      id: 101,
      isListened: true,
      isSaved: false,
      coverageScore: 0.92,
    });
    expect(result.data.episodes[1]).toMatchObject({
      id: 102,
      isListened: false,
      isSaved: true,
    });
    expect(result.data.episodes[2]).toMatchObject({
      id: 103,
      isListened: false,
      isSaved: false,
    });

    expect(result.data.relatedTopics).toHaveLength(2);
    expect(result.data.relatedTopics[0]).toMatchObject({
      id: 8,
      label: "Related A",
      kind: "concept",
    });
  });

  // ── Case: showOnlyUnheard adds the listenHistory IS NULL clause ────────────

  it("forwards showOnlyUnheard as an extra `isNull(listen_history.id)` condition", async () => {
    setupSelectChains([
      { where: [makeCanonicalRow()] },
      { where: [] },
      { joinedWhereOrderBy: [] },
    ]);
    mockDbExecute.mockResolvedValue({ rows: [] });

    const drizzle = await import("drizzle-orm");
    const isNullSpy = vi.mocked(drizzle.isNull);
    isNullSpy.mockClear();

    await getTopicDetailData({ canonicalTopicId: 5, showOnlyUnheard: true });

    // The episodes query passes `isNull(listenHistory.id)` to the WHERE clause.
    expect(isNullSpy).toHaveBeenCalledWith("listen_history.id");
  });

  // ── Case: only completed listens count — completedAt IS NOT NULL on the join ─

  it("listenHistory join includes isNotNull(completedAt) so partial plays don't count as listened", async () => {
    setupSelectChains([
      { where: [makeCanonicalRow()] },
      { where: [] },
      { joinedWhereOrderBy: [] },
    ]);
    mockDbExecute.mockResolvedValue({ rows: [] });

    const drizzle = await import("drizzle-orm");
    const isNotNullSpy = vi.mocked(drizzle.isNotNull);
    isNotNullSpy.mockClear();

    await getTopicDetailData({ canonicalTopicId: 5 });

    expect(isNotNullSpy).toHaveBeenCalledWith("listen_history.completedAt");
  });

  it("does not add the unheard predicate when showOnlyUnheard is false/undefined", async () => {
    setupSelectChains([
      { where: [makeCanonicalRow()] },
      { where: [] },
      { joinedWhereOrderBy: [] },
    ]);
    mockDbExecute.mockResolvedValue({ rows: [] });

    const drizzle = await import("drizzle-orm");
    const isNullSpy = vi.mocked(drizzle.isNull);
    isNullSpy.mockClear();

    await getTopicDetailData({ canonicalTopicId: 5 });

    expect(isNullSpy).not.toHaveBeenCalledWith("listen_history.id");
  });

  // ── Case: relatedTopics → kNN excludes self and limits to 5 ────────────────

  it("kNN call uses LIMIT 5 and excludes self via WHERE id <> $self", async () => {
    setupSelectChains([
      { where: [makeCanonicalRow({ id: 42 })] },
      { where: [] },
      { joinedWhereOrderBy: [] },
    ]);
    mockDbExecute.mockResolvedValue({ rows: [] });

    await getTopicDetailData({ canonicalTopicId: 42 });

    expect(mockDbExecute).toHaveBeenCalledOnce();
    const sqlArg = mockDbExecute.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };
    const fullText = sqlArg.strings.join(" ");
    // LIMIT is passed as a bound value (RELATED_TOPICS_LIMIT), not inlined.
    expect(sqlArg.values).toContain(RELATED_TOPICS_LIMIT);
    expect(fullText).toContain("status = 'active'");
    // Self-exclusion: the canonical id appears as a bound value in the SQL fragment.
    expect(sqlArg.values).toContain(42);
  });

  // ── Case: digest is null when no digest row exists ─────────────────────────

  it("returns digest: null when no digest row exists", async () => {
    setupSelectChains([
      { where: [makeCanonicalRow()] },
      { where: [] },
      { joinedWhereOrderBy: [] },
    ]);
    mockDbExecute.mockResolvedValue({ rows: [] });

    const result = await getTopicDetailData({ canonicalTopicId: 5 });
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("expected success");
    expect(result.data.digest).toBeNull();
  });

  // ── Case: empty embedding → relatedTopics returns [] without kNN ───────────

  it("skips kNN when canonical's identity_embedding is null/empty", async () => {
    setupSelectChains([
      { where: [makeCanonicalRow({ identityEmbedding: null })] },
      { where: [] },
      { joinedWhereOrderBy: [] },
    ]);

    const result = await getTopicDetailData({ canonicalTopicId: 5 });
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("expected success");
    expect(result.data.relatedTopics).toEqual([]);
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  // ── Case: completedSummaryCount derives correctly into payload ─────────────

  it("threshold-eligibility is derived from completedSummaryCount, not episodeCount", async () => {
    setupSelectChains([
      {
        where: [
          // raw junction count high, completed count below threshold
          makeCanonicalRow({
            episodeCount: 10,
            completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST - 1,
          }),
        ],
      },
      { where: [] },
      { joinedWhereOrderBy: [] },
    ]);
    mockDbExecute.mockResolvedValue({ rows: [] });

    const result = await getTopicDetailData({ canonicalTopicId: 5 });
    if (!result.success) throw new Error("expected success");
    expect(result.data.canonical.completedSummaryCount).toBe(
      MIN_DERIVED_COUNT_FOR_DIGEST - 1,
    );
    expect(result.data.canonical.episodeCount).toBe(10);
  });
});

// ============================================================================
// triggerTopicDigestRefresh
// ============================================================================

describe("triggerTopicDigestRefresh", () => {
  // Auth-call-count assertions across these tests guard the single-`auth()`
  // contract from issue #452 — refresh previously delegated through the
  // public `triggerTopicDigestGeneration`, double-wrapping `withAuthAction`.
  it("returns Unauthorized without a session", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await triggerTopicDigestRefresh({ canonicalTopicId: 1 });
    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
    expect(mockCreatePublicToken).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])("rejects invalid canonicalTopicId %s", async (id) => {
    const result = await triggerTopicDigestRefresh({ canonicalTopicId: id });
    expect(result).toMatchObject({ success: false });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
    expect(mockCreatePublicToken).not.toHaveBeenCalled();
  });

  it("ineligible: passes through without calling createPublicToken", async () => {
    setupSelectChains([
      {
        where: [
          {
            id: 5,
            label: "T",
            summary: "S",
            status: "active",
            completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST - 1,
          },
        ],
      },
      { where: [] },
    ]);

    const result = await triggerTopicDigestRefresh({ canonicalTopicId: 5 });
    expect(result).toMatchObject({
      success: true,
      data: { status: "ineligible" },
    });
    expect(mockCreatePublicToken).not.toHaveBeenCalled();
    expect(mockAuth).toHaveBeenCalledTimes(1);
  });

  it("cached: passes through without calling createPublicToken", async () => {
    setupSelectChains([
      {
        where: [
          {
            id: 5,
            label: "T",
            summary: "S",
            status: "active",
            completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST + 1,
          },
        ],
      },
      {
        where: [
          {
            id: 22,
            episodeCountAtGeneration: MIN_DERIVED_COUNT_FOR_DIGEST + 1,
          },
        ],
      },
    ]);

    const result = await triggerTopicDigestRefresh({ canonicalTopicId: 5 });
    expect(result).toMatchObject({
      success: true,
      data: { status: "cached", digestId: 22 },
    });
    expect(mockCreatePublicToken).not.toHaveBeenCalled();
    expect(mockTasksTrigger).not.toHaveBeenCalled();
    expect(mockAuth).toHaveBeenCalledTimes(1);
  });

  it("queued: bundles publicAccessToken from auth.createPublicToken with 15m TTL", async () => {
    setupSelectChains([
      {
        where: [
          {
            id: 5,
            label: "T",
            summary: "S",
            status: "active",
            completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST + 1,
          },
        ],
      },
      { where: [] },
    ]);
    mockTasksTrigger.mockResolvedValue({ id: "run_abc" });
    mockCreatePublicToken.mockResolvedValue("tok_xyz");

    const result = await triggerTopicDigestRefresh({ canonicalTopicId: 5 });

    expect(result).toMatchObject({
      success: true,
      data: {
        status: "queued",
        runId: "run_abc",
        publicAccessToken: "tok_xyz",
      },
    });
    expect(mockCreatePublicToken).toHaveBeenCalledWith({
      scopes: { read: { runs: ["run_abc"] } },
      expirationTime: "15m",
    });
    expect(mockAuth).toHaveBeenCalledTimes(1);
  });

  it("returns success: false with the underlying error when tasks.trigger rejects", async () => {
    setupSelectChains([
      {
        where: [
          {
            id: 5,
            label: "T",
            summary: "S",
            status: "active",
            completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST + 1,
          },
        ],
      },
      { where: [] },
    ]);
    mockTasksTrigger.mockRejectedValueOnce(new Error("trigger sdk down"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await triggerTopicDigestRefresh({ canonicalTopicId: 1 });

    expect(result).toMatchObject({ success: false });
    if (result.success) throw new Error("expected failure");
    expect(result.error).toBe("trigger sdk down");
    expect(mockCreatePublicToken).not.toHaveBeenCalled();
    expect(mockAuth).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it("queued: returns token-failed error when createPublicToken throws", async () => {
    setupSelectChains([
      {
        where: [
          {
            id: 5,
            label: "T",
            summary: "S",
            status: "active",
            completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST + 1,
          },
        ],
      },
      { where: [] },
    ]);
    mockTasksTrigger.mockResolvedValue({ id: "run_abc" });
    mockCreatePublicToken.mockRejectedValue(new Error("trigger sdk down"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await triggerTopicDigestRefresh({ canonicalTopicId: 5 });

    expect(result).toEqual({ success: false, error: "token-failed" });
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(mockAuth).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it("returns cached just below staleness threshold (boundary - 1 is NOT stale)", async () => {
    const existingCount = MIN_DERIVED_COUNT_FOR_DIGEST + 5;
    // Growth is exactly STALENESS_GROWTH_THRESHOLD - 1 → should be cached
    const currentCount = existingCount + (STALENESS_GROWTH_THRESHOLD - 1);
    setupSelectChains([
      {
        where: [
          {
            id: 5,
            label: "T",
            summary: "S",
            status: "active",
            completedSummaryCount: currentCount,
          },
        ],
      },
      {
        where: [{ id: 22, episodeCountAtGeneration: existingCount }],
      },
    ]);

    const result = await triggerTopicDigestRefresh({ canonicalTopicId: 5 });
    expect(result).toMatchObject({
      success: true,
      data: { status: "cached", digestId: 22 },
    });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  it("queues at exactly staleness threshold (boundary = STALENESS_GROWTH_THRESHOLD)", async () => {
    const existingCount = MIN_DERIVED_COUNT_FOR_DIGEST + 5;
    // Growth is exactly STALENESS_GROWTH_THRESHOLD → should queue
    const currentCount = existingCount + STALENESS_GROWTH_THRESHOLD;
    setupSelectChains([
      {
        where: [
          {
            id: 5,
            label: "T",
            summary: "S",
            status: "active",
            completedSummaryCount: currentCount,
          },
        ],
      },
      {
        where: [{ id: 22, episodeCountAtGeneration: existingCount }],
      },
    ]);
    mockTasksTrigger.mockResolvedValue({ id: "run_stale" });
    mockCreatePublicToken.mockResolvedValue("tok_stale");

    const result = await triggerTopicDigestRefresh({ canonicalTopicId: 5 });
    expect(result).toMatchObject({
      success: true,
      data: { status: "queued", runId: "run_stale" },
    });
    expect(mockTasksTrigger).toHaveBeenCalledOnce();
  });
});
