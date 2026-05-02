import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- @/db mock (must be declared before imports) ----
const mockSelect = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

// ---- @/db/schema mock ----
vi.mock("@/db/schema", () => ({
  canonicalTopics: {
    id: "ct.id",
    label: "ct.label",
    kind: "ct.kind",
    status: "ct.status",
    ongoing: "ct.ongoing",
    mergedIntoId: "ct.merged_into_id",
    lastSeen: "ct.last_seen",
  },
  episodeCanonicalTopics: {
    id: "ect.id",
    episodeId: "ect.episode_id",
    canonicalTopicId: "ect.canonical_topic_id",
    matchMethod: "ect.match_method",
    similarityToTopMatch: "ect.similarity_to_top_match",
    createdAt: "ect.created_at",
  },
  episodes: {
    id: "e.id",
    podcastIndexId: "e.podcast_index_id",
    title: "e.title",
    transcriptStatus: "e.transcript_status",
    summaryStatus: "e.summary_status",
  },
  canonicalTopicAdminLog: {
    id: "ctal.id",
    actor: "ctal.actor",
    action: "ctal.action",
    loserId: "ctal.loser_id",
    winnerId: "ctal.winner_id",
    metadata: "ctal.metadata",
    createdAt: "ctal.created_at",
  },
}));

// ---- drizzle-orm mock ----
vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (_strings: TemplateStringsArray, ..._vals: unknown[]) => ({
      mapWith: (_fn: unknown) => ({ sqlMapped: true }),
    }),
    { raw: (s: string) => s },
  ),
  and: vi.fn((...args: unknown[]) => ({ and: args.filter(Boolean) })),
  ilike: vi.fn((col: unknown, val: unknown) => ({ ilike: [col, val] })),
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  count: vi.fn(() => ({ countFn: true })),
  desc: vi.fn((val: unknown) => ({ desc: val })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ inArray: [col, vals] })),
}));

// ---- canonical-topic-episode-count mock ----
vi.mock("@/lib/admin/canonical-topic-episode-count", () => ({
  canonicalTopicEpisodeCount: vi.fn(() => ({ episodeCountSubq: true })),
}));

// ---------------------------------------------------------------------------

/** Build a Drizzle-like query chain that resolves to `rows`. */
function makeQueryChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "leftJoin",
    "innerJoin",
    "where",
    "groupBy",
    "having",
    "orderBy",
    "limit",
    "offset",
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  // Make thenable so `await chain` resolves to `rows`
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import {
  getCanonicalMergeCleanupDriftQuery,
  getCanonicalTopicsListQuery,
  getLinkedEpisodesForTopicQuery,
} from "@/lib/admin/topic-queries";

// ===========================================================================
// T1 — getCanonicalMergeCleanupDriftQuery
// ===========================================================================

describe("getCanonicalMergeCleanupDriftQuery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty array when no merged topics have orphaned junction rows", async () => {
    mockSelect.mockReturnValue(makeQueryChain([]));
    const rows = await getCanonicalMergeCleanupDriftQuery();
    expect(rows).toEqual([]);
  });

  it("returns rows with the correct shape", async () => {
    const fixtures = [
      {
        id: 1,
        label: "Topic A",
        status: "merged",
        mergedIntoId: 99,
        junctionRowCount: 3,
      },
      {
        id: 2,
        label: "Topic B",
        status: "merged",
        mergedIntoId: 88,
        junctionRowCount: 1,
      },
    ];
    mockSelect.mockReturnValue(makeQueryChain(fixtures));
    const rows = await getCanonicalMergeCleanupDriftQuery();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 1, junctionRowCount: 3 });
    expect(rows[1]).toMatchObject({ id: 2, junctionRowCount: 1 });
  });

  it("applies groupBy, having, and limit(200) on the query chain", async () => {
    const chain = makeQueryChain([]);
    mockSelect.mockReturnValue(chain);
    await getCanonicalMergeCleanupDriftQuery();
    expect(chain.groupBy as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(chain.having as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(chain.limit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(200);
  });

  it("applies a leftJoin and a where clause on the query chain", async () => {
    const chain = makeQueryChain([]);
    mockSelect.mockReturnValue(chain);
    await getCanonicalMergeCleanupDriftQuery();
    expect(chain.leftJoin as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(chain.where as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });
});

// ===========================================================================
// T2 — getCanonicalTopicsListQuery (new filters: ongoing, episodeCountMin/Max)
// ===========================================================================

describe("getCanonicalTopicsListQuery — new filters", () => {
  beforeEach(() => vi.clearAllMocks());

  /** Set up two chained calls for the Promise.all([data, count]) pattern */
  function setupDoubleChain(
    dataRows: unknown[],
    countRows: unknown[] = [{ total: 0 }],
  ) {
    let calls = 0;
    mockSelect.mockImplementation(() => {
      calls += 1;
      return makeQueryChain(calls === 1 ? dataRows : countRows);
    });
  }

  it("passes ongoing=true filter through where conditions", async () => {
    setupDoubleChain([]);
    await getCanonicalTopicsListQuery({ page: 1, ongoing: true });
    // The eq mock should have been called with the ongoing column and true
    const { eq } = await import("drizzle-orm");
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls;
    const ongoingCall = calls.find(
      ([col]) => col === "ct.ongoing" || String(col).includes("ongoing"),
    );
    expect(ongoingCall).toBeDefined();
  });

  it("passes episodeCountMin filter through where conditions", async () => {
    setupDoubleChain([]);
    const chain = makeQueryChain([]);
    mockSelect.mockReturnValue(chain);
    // Should not throw; where must be called
    await getCanonicalTopicsListQuery({ page: 1, episodeCountMin: 5 });
    expect(chain.where as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });

  it("passes episodeCountMax filter through where conditions", async () => {
    setupDoubleChain([]);
    const chain = makeQueryChain([]);
    mockSelect.mockReturnValue(chain);
    await getCanonicalTopicsListQuery({ page: 1, episodeCountMax: 10 });
    expect(chain.where as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });

  it("both min and max compose correctly without throwing", async () => {
    setupDoubleChain([{ id: 1 }], [{ total: 1 }]);
    const result = await getCanonicalTopicsListQuery({
      page: 1,
      episodeCountMin: 2,
      episodeCountMax: 20,
    });
    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("totalCount");
  });

  // Regression: the episode-count range predicate must route through the
  // canonicalTopicEpisodeCount() helper — that helper is the only place that
  // qualifies the outer canonical_topics.id. An earlier inline-SQL version
  // used a bare ${canonicalTopics.id} which Postgres bound to the inner
  // junction PK, making the predicate effectively always-false.
  it("episode-count filter uses canonicalTopicEpisodeCount() (qualified outer id)", async () => {
    setupDoubleChain([]);
    const { canonicalTopicEpisodeCount } =
      await import("@/lib/admin/canonical-topic-episode-count");
    const helperMock = canonicalTopicEpisodeCount as ReturnType<typeof vi.fn>;
    const baselineCalls = helperMock.mock.calls.length;

    await getCanonicalTopicsListQuery({ page: 1, episodeCountMin: 1 });
    expect(helperMock.mock.calls.length).toBeGreaterThan(baselineCalls);

    const callsAfterMin = helperMock.mock.calls.length;
    await getCanonicalTopicsListQuery({
      page: 1,
      episodeCountMin: 1,
      episodeCountMax: 10,
    });
    expect(helperMock.mock.calls.length).toBeGreaterThan(callsAfterMin);
  });

  it("ongoing=false is passed correctly", async () => {
    setupDoubleChain([]);
    // Should not throw
    await expect(
      getCanonicalTopicsListQuery({ page: 1, ongoing: false }),
    ).resolves.toBeDefined();
  });
});

// ===========================================================================
// T3 — getLinkedEpisodesForTopicQuery
// ===========================================================================

describe("getLinkedEpisodesForTopicQuery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when no episodes are linked to the canonical", async () => {
    mockSelect.mockReturnValue(makeQueryChain([]));
    const rows = await getLinkedEpisodesForTopicQuery(42);
    expect(rows).toEqual([]);
  });

  it("returns rows with the correct shape for linked episodes", async () => {
    const fixtures = [
      {
        episodeId: 10,
        podcastIndexId: "pid_10",
        title: "Episode Ten",
        transcriptStatus: "available",
        summaryStatus: "completed",
        matchMethod: "auto",
        similarityToTopMatch: 0.95,
      },
      {
        episodeId: 11,
        podcastIndexId: "pid_11",
        title: "Episode Eleven",
        transcriptStatus: "missing",
        summaryStatus: null,
        matchMethod: "new",
        similarityToTopMatch: null,
      },
    ];
    mockSelect.mockReturnValue(makeQueryChain(fixtures));
    const rows = await getLinkedEpisodesForTopicQuery(99);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      episodeId: 10,
      transcriptStatus: "available",
      summaryStatus: "completed",
    });
    expect(rows[1]).toMatchObject({ episodeId: 11, matchMethod: "new" });
  });

  it("applies a join, where, orderBy, and limit on the query chain", async () => {
    const chain = makeQueryChain([]);
    mockSelect.mockReturnValue(chain);
    await getLinkedEpisodesForTopicQuery(5);
    expect(chain.from as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(chain.where as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(chain.orderBy as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(chain.limit as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });

  it("respects a custom limit option", async () => {
    const chain = makeQueryChain([]);
    mockSelect.mockReturnValue(chain);
    await getLinkedEpisodesForTopicQuery(5, { limit: 25 });
    expect(chain.limit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(25);
  });

  it("uses default limit of 100 when not specified", async () => {
    const chain = makeQueryChain([]);
    mockSelect.mockReturnValue(chain);
    await getLinkedEpisodesForTopicQuery(5);
    expect(chain.limit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(100);
  });

  it("only returns rows for the requested canonicalId", async () => {
    const chain = makeQueryChain([]);
    mockSelect.mockReturnValue(chain);
    await getLinkedEpisodesForTopicQuery(7);
    const { eq } = await import("drizzle-orm");
    const eqCalls = (eq as ReturnType<typeof vi.fn>).mock.calls;
    // eq should have been called with the canonical topic id column and the value 7
    const canonicalIdCall = eqCalls.find(([, val]) => val === 7);
    expect(canonicalIdCall).toBeDefined();
  });
});
