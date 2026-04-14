import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock DB select chain
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockUnion = vi.fn();
const mockInnerJoin = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();

// Mock database — supports both query API (findFirst/findMany/$count) and select chain.
// The select chain must handle these shapes:
//   Subqueries:       select().from().where()                  (return value unused)
//   Main query:       select().from().innerJoin().where().orderBy().limit()
//   Score lookup:     select().from().where()  → Promise<row[]>
//   Rank lookup:      select().from().where().groupBy()        → Promise<row[]>
//   Union query:      select().from().where().union(select().from().where())
//   Topic count:      select().from().where().groupBy()
//   Candidate topics: select().from().where()                  → Promise<row[]>
//
// whereNode returns an object that is BOTH awaitable and has chainable methods.
const mockGroupBy = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@/db", () => ({
  db: {
    $count: vi.fn(),
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const whereNode = (...wArgs: unknown[]) => {
        const result = mockWhere(...wArgs);
        // Return an object that is both a Promise (for direct await) and has chained methods
        const thenable = Promise.resolve(result).then((v) => v);
        return Object.assign(thenable, {
          orderBy: (...oArgs: unknown[]) => {
            mockOrderBy(...oArgs);
            return {
              limit: (...lArgs: unknown[]) => mockLimit(...lArgs),
            };
          },
          groupBy: (...gArgs: unknown[]) => {
            return mockGroupBy(...gArgs);
          },
          union: (...uArgs: unknown[]) => {
            return mockUnion(...uArgs);
          },
          limit: (...lArgs: unknown[]) => mockLimit(...lArgs),
        });
      };
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: whereNode,
            innerJoin: (...jArgs: unknown[]) => {
              mockInnerJoin(...jArgs);
              return { where: whereNode };
            },
          };
        },
      };
    },
    query: {
      trendingTopics: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
      userSubscriptions: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
    },
  },
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  userSubscriptions: { userId: "user_id", podcastId: "podcast_id" },
  userLibrary: { userId: "user_id", episodeId: "episode_id" },
  listenHistory: { userId: "user_id", episodeId: "episode_id" },
  episodes: {
    id: "id",
    podcastIndexId: "podcast_index_id",
    title: "title",
    description: "description",
    audioUrl: "audio_url",
    duration: "duration",
    publishDate: "publish_date",
    worthItScore: "worth_it_score",
    podcastId: "podcast_id",
  },
  podcasts: {
    id: "id",
    title: "title",
    imageUrl: "image_url",
    podcastIndexId: "podcast_index_id",
  },
  trendingTopics: { generatedAt: "generated_at", id: "id" },
  episodeTopics: {
    episodeId: "episode_id",
    topic: "topic",
    topicRank: "topic_rank",
    rankedAt: "ranked_at",
    relevance: "relevance",
  },
  userActivity: {},
}));

// Mock drizzle-orm — include all imports used by dashboard.ts
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _op: "eq", args })),
  desc: vi.fn((...args: unknown[]) => ({ _op: "desc", args })),
  gte: vi.fn((...args: unknown[]) => ({ _op: "gte", args })),
  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
  isNotNull: vi.fn((...args: unknown[]) => ({ _op: "isNotNull", args })),
  notInArray: vi.fn((...args: unknown[]) => ({ _op: "notInArray", args })),
  inArray: vi.fn((...args: unknown[]) => ({ _op: "inArray", args })),
  sql: vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) => ({ _op: "sql" })),
}));

// Mock topic-overlap — keeps dashboard tests focused on wiring, not overlap logic
const mockComputeTopicOverlap = vi.fn();
const mockBuildUserTopicProfile = vi.fn();
vi.mock("@/lib/topic-overlap", () => ({
  computeTopicOverlap: (...args: unknown[]) => mockComputeTopicOverlap(...args),
  buildUserTopicProfile: (...args: unknown[]) => mockBuildUserTopicProfile(...args),
}));

// Mock podcastindex — used by getRecentEpisodesFromSubscriptions
const mockGetEpisodesByFeedId = vi.fn();
vi.mock("@/lib/podcastindex", () => ({
  getEpisodesByFeedId: (...args: unknown[]) => mockGetEpisodesByFeedId(...args),
}));

describe("getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getDashboardStats } = await import("@/app/actions/dashboard");
    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(0);
    expect(result.savedCount).toBe(0);
    expect(result.error).toMatch(/signed in/i);
  });

  it("returns counts correctly using SQL COUNT()", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });

    const { db } = await import("@/db");
    (db.$count as any)
      .mockResolvedValueOnce(5) // for subscriptions
      .mockResolvedValueOnce(3); // for library

    const { getDashboardStats } = await import("@/app/actions/dashboard");
    const { eq } = await import("drizzle-orm");
    const { userSubscriptions, userLibrary } = await import("@/db/schema");
    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(5);
    expect(result.savedCount).toBe(3);
    expect(result.error).toBeNull();

    expect(db.$count).toHaveBeenCalledTimes(2);
    expect(db.$count).toHaveBeenCalledWith(
      userSubscriptions,
      expect.anything()
    );
    expect(db.$count).toHaveBeenCalledWith(userLibrary, expect.anything());
    expect(eq).toHaveBeenCalledWith("user_id", "user_123");
  });

  it("handles zero counts correctly", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });

    const { db } = await import("@/db");
    (db.$count as any).mockResolvedValue(0);

    const { getDashboardStats } = await import("@/app/actions/dashboard");
    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(0);
    expect(result.savedCount).toBe(0);
    expect(result.error).toBeNull();
  });

  it("handles database errors gracefully", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });

    const { db } = await import("@/db");
    (db.$count as any).mockRejectedValue(new Error("DB connection failed"));

    const { getDashboardStats } = await import("@/app/actions/dashboard");
    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(0);
    expect(result.savedCount).toBe(0);
    expect(result.error).toMatch(/failed to load/i);
  });
});

describe("getTrendingTopics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getTrendingTopics } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopics();

    expect(result.topics).toBeNull();
    expect(result.error).toMatch(/signed in/i);
  });

  it("returns null topics when no snapshots exist", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirst.mockResolvedValue(undefined);

    const { getTrendingTopics } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopics();

    expect(result.topics).toBeNull();
    expect(result.error).toBeNull();
  });

  it("returns empty items when the latest snapshot has no topics", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirst.mockResolvedValue({
      id: 1,
      topics: [],
      generatedAt: new Date("2026-03-13T06:00:00Z"),
      periodStart: new Date("2026-03-06T06:00:00Z"),
      periodEnd: new Date("2026-03-13T06:00:00Z"),
      episodeCount: 0,
      createdAt: new Date("2026-03-13T06:00:00Z"),
    });

    const { getTrendingTopics } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopics();

    expect(result.error).toBeNull();
    expect(result.topics).not.toBeNull();
    expect(result.topics!.items).toEqual([]);
  });

  it("returns formatted trending topics from latest snapshot", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });

    const mockSnapshot = {
      id: 1,
      topics: [
        {
          name: "AI & ML",
          description: "Artificial intelligence trends",
          episodeCount: 5,
          episodeIds: [1, 2, 3, 4, 5],
        },
      ],
      generatedAt: new Date("2026-03-13T06:00:00Z"),
      periodStart: new Date("2026-03-06T06:00:00Z"),
      periodEnd: new Date("2026-03-13T06:00:00Z"),
      episodeCount: 10,
      createdAt: new Date("2026-03-13T06:00:00Z"),
    };
    mockFindFirst.mockResolvedValue(mockSnapshot);

    const { getTrendingTopics } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopics();

    expect(result.error).toBeNull();
    expect(result.topics).not.toBeNull();
    expect(result.topics!.items).toHaveLength(1);
    expect(result.topics!.items[0].name).toBe("AI & ML");
    expect(result.topics!.generatedAt).toEqual(mockSnapshot.generatedAt);
    expect(result.topics!.periodStart).toEqual(mockSnapshot.periodStart);
    expect(result.topics!.periodEnd).toEqual(mockSnapshot.periodEnd);
    expect(result.topics!.episodeCount).toBe(10);
  });

  it("returns error on database failure", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirst.mockRejectedValue(new Error("DB connection failed"));

    const { getTrendingTopics } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopics();

    expect(result.topics).toBeNull();
    expect(result.error).toMatch(/failed to load/i);
  });
});

describe("getRecommendedEpisodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockLimit.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([]);
    // Overlap defaults: no consumed episodes, no-op profile and overlap
    mockUnion.mockResolvedValue([]);
    mockWhere.mockResolvedValue([]);
    mockBuildUserTopicProfile.mockReturnValue(new Map());
    mockComputeTopicOverlap.mockReturnValue({ overlapCount: 0, topOverlapTopic: null, isNewTopic: false, label: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    expect(result.episodes).toEqual([]);
    expect(result.error).toMatch(/signed in/i);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns empty episodes array when no scored episodes exist", async () => {
    mockLimit.mockResolvedValue([]);

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    expect(result.episodes).toEqual([]);
    expect(result.error).toBeNull();
  });

  it("returns recommended episodes with all required fields on success", async () => {
    const mockEpisodes = [
      {
        id: 1,
        podcastIndexId: "ep-123",
        title: "AI Deep Dive",
        description: "An exploration of modern AI",
        audioUrl: "https://example.com/audio.mp3",
        duration: 3600,
        publishDate: new Date("2026-03-01T00:00:00Z"),
        worthItScore: "8.50",
        podcastTitle: "Tech Talks",
        podcastImageUrl: "https://example.com/image.jpg",
      },
      {
        id: 2,
        podcastIndexId: "ep-789",
        title: "Future of Work",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "7.20",
        podcastTitle: "Work Forward",
        podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes(6);

    expect(result.error).toBeNull();
    expect(result.episodes).toHaveLength(2);

    // First episode — verify all DTO fields are present
    expect(result.episodes[0].id).toBe(1);
    expect(result.episodes[0].podcastIndexId).toBe("ep-123");
    expect(result.episodes[0].title).toBe("AI Deep Dive");
    expect(result.episodes[0].worthItScore).toBe("8.50");
    expect(result.episodes[0].podcastTitle).toBe("Tech Talks");
    expect(result.episodes[0].podcastImageUrl).toBe("https://example.com/image.jpg");
    // Second episode — verify nullable fields
    expect(result.episodes[1].description).toBeNull();
    expect(result.episodes[1].audioUrl).toBeNull();
    expect(result.episodes[1].podcastImageUrl).toBeNull();

    // orderBy() and limit() only on the main query
    expect(mockOrderBy).toHaveBeenCalledTimes(1);
    expect(mockLimit).toHaveBeenCalledWith(6);
  });

  it("populates bestTopicRank and topRankedTopic when rank data exists", async () => {
    const mockEpisodes = [
      {
        id: 1,
        podcastIndexId: "ep-123",
        title: "AI Deep Dive",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "8.50",
        podcastTitle: "Tech Talks",
        podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);
    mockGroupBy.mockResolvedValue([
      { episodeId: 1, bestRank: 2, topTopic: "Artificial Intelligence" },
    ]);

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    expect(result.episodes[0].bestTopicRank).toBe(2);
    expect(result.episodes[0].topRankedTopic).toBe("Artificial Intelligence");
  });

  it("uses default limit of 10 when called with no arguments", async () => {
    mockLimit.mockResolvedValue([]);

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    await getRecommendedEpisodes();

    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it("returns error and empty episodes on database failure", async () => {
    mockLimit.mockRejectedValue(new Error("DB connection failed"));

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    expect(result.episodes).toEqual([]);
    expect(result.error).toMatch(/failed to load/i);
  });

  // T4: Verification tests for overlap integration

  it("attaches overlap fields to recommended episodes when user has history", async () => {
    const mockEpisodes = [
      {
        id: 1,
        podcastIndexId: "ep-123",
        title: "AI Ethics Deep Dive",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "8.50",
        podcastTitle: "Tech Talks",
        podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);
    // User has consumed 4 episodes; union returns 4 rows
    mockUnion.mockResolvedValue([
      { episodeId: 10 }, { episodeId: 11 }, { episodeId: 12 }, { episodeId: 13 },
    ]);
    // Topic profile: AI Ethics appears 4 times
    mockBuildUserTopicProfile.mockReturnValue(new Map([["AI Ethics", 4]]));
    mockComputeTopicOverlap.mockReturnValue({
      overlapCount: 4,
      topOverlapTopic: "AI Ethics",
      isNewTopic: false,
      label: "You've heard 4 similar episodes",
    });

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    expect(result.error).toBeNull();
    expect(result.episodes[0].overlapCount).toBe(4);
    expect(result.episodes[0].overlapTopic).toBe("AI Ethics");
    expect(result.episodes[0].overlapLabel).toBe("You've heard 4 similar episodes");
  });

  it("sorts episodes with overlapCount >= 3 after non-overlapping episodes (stable partition)", async () => {
    const mockEpisodes = [
      {
        id: 1,
        podcastIndexId: "ep-1",
        title: "High Overlap",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "9.00",
        podcastTitle: "Podcast A",
        podcastImageUrl: null,
      },
      {
        id: 2,
        podcastIndexId: "ep-2",
        title: "No Overlap",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "7.00",
        podcastTitle: "Podcast B",
        podcastImageUrl: null,
      },
      {
        id: 3,
        podcastIndexId: "ep-3",
        title: "Also No Overlap",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "6.50",
        podcastTitle: "Podcast C",
        podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);
    mockUnion.mockResolvedValue([{ episodeId: 100 }, { episodeId: 101 }, { episodeId: 102 }]);
    mockBuildUserTopicProfile.mockReturnValue(new Map([["AI Ethics", 4]]));
    // ep-1 has high overlap, ep-2 and ep-3 have none
    mockComputeTopicOverlap
      .mockReturnValueOnce({ overlapCount: 4, topOverlapTopic: "AI Ethics", isNewTopic: false, label: "You've heard 4 similar episodes" })
      .mockReturnValueOnce({ overlapCount: 0, topOverlapTopic: null, isNewTopic: false, label: null })
      .mockReturnValueOnce({ overlapCount: 0, topOverlapTopic: null, isNewTopic: false, label: null });

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    // ep-2 and ep-3 (no overlap) should come before ep-1 (overlapCount >= 3)
    expect(result.episodes[0].podcastIndexId).toBe("ep-2");
    expect(result.episodes[1].podcastIndexId).toBe("ep-3");
    expect(result.episodes[2].podcastIndexId).toBe("ep-1");
  });

  it("preserves original order within each partition (stable sort)", async () => {
    const mockEpisodes = [
      {
        id: 1, podcastIndexId: "ep-1", title: "A", description: null, audioUrl: null,
        duration: null, publishDate: null, worthItScore: "9.00", podcastTitle: "P", podcastImageUrl: null,
      },
      {
        id: 2, podcastIndexId: "ep-2", title: "B", description: null, audioUrl: null,
        duration: null, publishDate: null, worthItScore: "8.00", podcastTitle: "P", podcastImageUrl: null,
      },
      {
        id: 3, podcastIndexId: "ep-3", title: "C", description: null, audioUrl: null,
        duration: null, publishDate: null, worthItScore: "7.00", podcastTitle: "P", podcastImageUrl: null,
      },
      {
        id: 4, podcastIndexId: "ep-4", title: "D", description: null, audioUrl: null,
        duration: null, publishDate: null, worthItScore: "6.00", podcastTitle: "P", podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);
    mockUnion.mockResolvedValue([{ episodeId: 99 }, { episodeId: 98 }, { episodeId: 97 }]);
    mockBuildUserTopicProfile.mockReturnValue(new Map());
    // ep-1 and ep-3 have high overlap; ep-2 and ep-4 have none
    mockComputeTopicOverlap
      .mockReturnValueOnce({ overlapCount: 5, topOverlapTopic: "X", isNewTopic: false, label: "You've heard 5 similar episodes" })
      .mockReturnValueOnce({ overlapCount: 0, topOverlapTopic: null, isNewTopic: false, label: null })
      .mockReturnValueOnce({ overlapCount: 3, topOverlapTopic: "Y", isNewTopic: false, label: "You've heard 3 similar episodes" })
      .mockReturnValueOnce({ overlapCount: 0, topOverlapTopic: null, isNewTopic: false, label: null });

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    // Non-overlapping in original order: ep-2, ep-4; then overlapping in original order: ep-1, ep-3
    expect(result.episodes.map((e) => e.podcastIndexId)).toEqual(["ep-2", "ep-4", "ep-1", "ep-3"]);
  });

  it("global gate: user with < 3 consumed episodes gets no overlap data", async () => {
    const mockEpisodes = [
      {
        id: 1,
        podcastIndexId: "ep-123",
        title: "AI Deep Dive",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "8.50",
        podcastTitle: "Tech Talks",
        podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);
    // User has only 2 consumed episodes
    mockUnion.mockResolvedValue([{ episodeId: 1 }, { episodeId: 2 }]);
    mockBuildUserTopicProfile.mockReturnValue(new Map());
    mockComputeTopicOverlap.mockReturnValue({ overlapCount: 0, topOverlapTopic: null, isNewTopic: false, label: null });

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    expect(result.error).toBeNull();
    expect(result.episodes[0].overlapLabel).toBeNull();
  });

  it("returns episodes without overlap data when overlap queries fail (graceful degradation)", async () => {
    const mockEpisodes = [
      {
        id: 1,
        podcastIndexId: "ep-123",
        title: "AI Deep Dive",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "8.50",
        podcastTitle: "Tech Talks",
        podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);
    // Simulate overlap query failure
    mockUnion.mockRejectedValue(new Error("DB error"));

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    // Episodes still returned, no error surfaced to caller
    expect(result.error).toBeNull();
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0].title).toBe("AI Deep Dive");
  });
});

// ---------------------------------------------------------------------------
// T4: getEpisodeTopicOverlap tests
// ---------------------------------------------------------------------------

describe("getEpisodeTopicOverlap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockWhere.mockResolvedValue([]);
    mockUnion.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([]);
    mockLimit.mockResolvedValue([]);
    mockBuildUserTopicProfile.mockReturnValue(new Map());
    mockComputeTopicOverlap.mockReturnValue({ overlapCount: 0, topOverlapTopic: null, isNewTopic: false, label: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns null result when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap("ep-123");

    expect(result.label).toBeNull();
    expect(result.overlapCount).toBe(0);
  });

  it("returns null result when episode is not found in DB", async () => {
    // limit returns empty — episode not in DB
    mockLimit.mockResolvedValue([]);

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap("ep-999");

    expect(result.label).toBeNull();
  });

  it("returns computed overlap for a found episode", async () => {
    // Episode lookup returns a row
    mockLimit.mockResolvedValue([{ id: 42 }]);
    // User has 5 consumed episodes
    mockUnion.mockResolvedValue([
      { episodeId: 1 }, { episodeId: 2 }, { episodeId: 3 }, { episodeId: 4 }, { episodeId: 5 },
    ]);
    mockBuildUserTopicProfile.mockReturnValue(new Map([["Leadership", 4]]));
    // Episode topics returned by where()
    mockWhere.mockResolvedValue([
      { topic: "Leadership", relevance: "0.90", topicRank: 1 },
    ]);
    mockComputeTopicOverlap.mockReturnValue({
      overlapCount: 4,
      topOverlapTopic: "Leadership",
      isNewTopic: false,
      label: "You've heard 4 similar episodes",
    });

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap("ep-42");

    expect(result.label).toBe("You've heard 4 similar episodes");
    expect(result.overlapCount).toBe(4);
    expect(result.topOverlapTopic).toBe("Leadership");
  });

  it("returns null result when episode has no topic tags", async () => {
    mockLimit.mockResolvedValue([{ id: 42 }]);
    mockUnion.mockResolvedValue([{ episodeId: 1 }, { episodeId: 2 }, { episodeId: 3 }]);
    mockBuildUserTopicProfile.mockReturnValue(new Map());
    // No topics for this episode
    mockWhere.mockResolvedValue([]);
    mockComputeTopicOverlap.mockReturnValue({ overlapCount: 0, topOverlapTopic: null, isNewTopic: false, label: null });

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap("ep-42");

    expect(result.label).toBeNull();
  });

  it("returns null result on DB error (graceful fallback)", async () => {
    mockLimit.mockRejectedValue(new Error("DB failure"));

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap("ep-42");

    expect(result.label).toBeNull();
    expect(result.overlapCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Helper factories for getRecentEpisodesFromSubscriptions tests
// ---------------------------------------------------------------------------

function makeSubscription(podcastIndexId: string) {
  return {
    podcast: {
      podcastIndexId,
      title: `Podcast ${podcastIndexId}`,
      imageUrl: `https://example.com/${podcastIndexId}.jpg`,
    },
  };
}

function makeApiEpisode(overrides: {
  id: number;
  feedId: number;
  title?: string;
  datePublished?: number;
  duration?: number;
}) {
  return {
    id: overrides.id,
    feedId: overrides.feedId,
    title: overrides.title ?? `Episode ${overrides.id}`,
    datePublished: overrides.datePublished ?? 1_000_000,
    duration: overrides.duration ?? 1800,
    description: null,
    feedImage: null,
    enclosureUrl: null,
  };
}

describe("getRecentEpisodesFromSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    // Default: no score rows from DB
    mockWhere.mockResolvedValue([]);
    // Default: no API episodes
    mockGetEpisodesByFeedId.mockResolvedValue({ items: [] });
    // Default: no subscriptions
    mockFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getRecentEpisodesFromSubscriptions } = await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes).toEqual([]);
    expect(result.hasSubscriptions).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });

  it("returns empty episodes and hasSubscriptions=false when user has no subscriptions", async () => {
    mockFindMany.mockResolvedValue([]);

    const { getRecentEpisodesFromSubscriptions } = await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes).toEqual([]);
    expect(result.hasSubscriptions).toBe(false);
    expect(result.error).toBeNull();
  });

  it("returns empty episodes and hasSubscriptions=true when subscriptions exist but no episodes returned", async () => {
    mockFindMany.mockResolvedValue([makeSubscription("123")]);
    mockGetEpisodesByFeedId.mockResolvedValue({ items: [] });

    const { getRecentEpisodesFromSubscriptions } = await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes).toEqual([]);
    expect(result.hasSubscriptions).toBe(true);
    expect(result.error).toBeNull();
  });

  it("filters episodes by since timestamp", async () => {
    const since = 2_000_000;
    mockFindMany.mockResolvedValue([makeSubscription("111")]);
    mockGetEpisodesByFeedId.mockResolvedValue({
      items: [
        makeApiEpisode({ id: 1, feedId: 111, datePublished: 3_000_000 }), // after since
        makeApiEpisode({ id: 2, feedId: 111, datePublished: 1_000_000 }), // before since
      ],
    });

    const { getRecentEpisodesFromSubscriptions } = await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions({ since });

    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0].id).toBe(1);
  });

  it("returns all episodes when since is not provided", async () => {
    mockFindMany.mockResolvedValue([makeSubscription("111")]);
    mockGetEpisodesByFeedId.mockResolvedValue({
      items: [
        makeApiEpisode({ id: 1, feedId: 111, datePublished: 3_000_000 }),
        makeApiEpisode({ id: 2, feedId: 111, datePublished: 1_000_000 }),
      ],
    });

    const { getRecentEpisodesFromSubscriptions } = await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes).toHaveLength(2);
  });

  it("places scored episodes before unscored, scored sorted by score DESC", async () => {
    mockFindMany.mockResolvedValue([makeSubscription("111")]);
    mockGetEpisodesByFeedId.mockResolvedValue({
      items: [
        makeApiEpisode({ id: 10, feedId: 111, datePublished: 1_000_003 }),
        makeApiEpisode({ id: 20, feedId: 111, datePublished: 1_000_002 }),
        makeApiEpisode({ id: 30, feedId: 111, datePublished: 1_000_001 }),
      ],
    });
    // Score rows: ep 10 = 5.0, ep 30 = 9.0, ep 20 = unscored
    const scoreHigh = 9.0;
    const scoreLow = 5.0;
    mockWhere.mockResolvedValue([
      { podcastIndexId: "10", worthItScore: String(scoreLow) },
      { podcastIndexId: "30", worthItScore: String(scoreHigh) },
    ]);

    const { getRecentEpisodesFromSubscriptions } = await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    // Scored episodes first: ep30 (9.0) then ep10 (5.0), then unscored ep20
    expect(result.episodes[0].id).toBe(30);
    expect(result.episodes[0].worthItScore).toBe(scoreHigh);
    expect(result.episodes[1].id).toBe(10);
    expect(result.episodes[1].worthItScore).toBe(scoreLow);
    expect(result.episodes[2].id).toBe(20);
    expect(result.episodes[2].worthItScore).toBeNull();
  });

  it("assigns null worthItScore to episodes not found in DB", async () => {
    mockFindMany.mockResolvedValue([makeSubscription("111")]);
    mockGetEpisodesByFeedId.mockResolvedValue({
      items: [makeApiEpisode({ id: 99, feedId: 111 })],
    });
    mockWhere.mockResolvedValue([]); // no DB rows

    const { getRecentEpisodesFromSubscriptions } = await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0].worthItScore).toBeNull();
  });

  it("parses worthItScore string from DB as a number", async () => {
    mockFindMany.mockResolvedValue([makeSubscription("222")]);
    mockGetEpisodesByFeedId.mockResolvedValue({
      items: [makeApiEpisode({ id: 55, feedId: 222 })],
    });
    mockWhere.mockResolvedValue([{ podcastIndexId: "55", worthItScore: "7.75" }]);

    const { getRecentEpisodesFromSubscriptions } = await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes[0].worthItScore).toBe(parseFloat("7.75"));
  });

  it("returns error and empty array on API failure", async () => {
    mockFindMany.mockResolvedValue([makeSubscription("111")]);
    mockGetEpisodesByFeedId.mockRejectedValue(new Error("API failure"));

    const { getRecentEpisodesFromSubscriptions } = await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes).toEqual([]);
    expect(result.error).toMatch(/failed to load/i);
  });
});
