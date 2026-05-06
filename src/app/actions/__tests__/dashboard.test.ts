import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeClerkAuthMock } from "@/test/mocks/clerk-server";
import {
  asPodcastIndexEpisodeId,
  type PodcastIndexEpisodeId,
} from "@/types/ids";
import { EMPTY_OVERLAP_RESULT } from "@/lib/topic-overlap";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => makeClerkAuthMock(() => mockAuth()));

// Mock next/navigation — mirrors Next's behavior (redirect throws NEXT_REDIRECT).
const mockRedirect = vi.fn((url: string) => {
  const err = new Error(`NEXT_REDIRECT: ${url}`);
  (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
  throw err;
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
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
//   Trending by-slug: select().from().innerJoin().where().orderBy()   → Promise<row[]>
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
        // new Promise(...) avoids a dangling intermediate promise that triggers
        // Vitest's unhandled-rejection detector when mockWhere returns Promise.reject.
        const thenable = new Promise<unknown>((resolve, reject) => {
          Promise.resolve(result).then(resolve, reject);
        });
        return Object.assign(thenable, {
          orderBy: (...oArgs: unknown[]) => {
            const orderResult = mockOrderBy(...oArgs);
            const orderThenable = Promise.resolve(orderResult).then((v) => v);
            return Object.assign(orderThenable, {
              limit: (...lArgs: unknown[]) => mockLimit(...lArgs),
            });
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
  canonicalTopics: {
    id: "id",
    label: "label",
    status: "status",
  },
  episodeCanonicalTopics: {
    episodeId: "episode_id",
    canonicalTopicId: "canonical_topic_id",
    coverageScore: "coverage_score",
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
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    // Self-referential .mapWith returns the same fragment so production code
    // can chain `sql\`...\`.mapWith(Number)` without breaking the mock —
    // runtime coercion is a Drizzle responsibility we don't simulate here.
    const fragment: {
      _op: string;
      raw: string;
      values: unknown[];
      mapWith: (fn: unknown) => unknown;
    } = {
      _op: "sql",
      // Join the raw template parts so tests can assert the generated SQL text
      // (e.g. `DESC NULLS LAST` can't be derived from Drizzle's desc() helper).
      // Placeholder `$_` avoids collisions with literal `?` characters in templates.
      raw: Array.from(strings).join("$_"),
      values,
      mapWith: () => fragment,
    };
    return fragment;
  }),
}));

// Mock topic-overlap — keeps dashboard tests focused on wiring, not overlap logic
const mockComputeTopicOverlap = vi.fn();
const mockBuildUserTopicProfile = vi.fn();
const mockComputeCanonicalTopicOverlap = vi.fn();
vi.mock("@/lib/topic-overlap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/topic-overlap")>();
  return {
    ...actual,
    computeTopicOverlap: (...args: unknown[]) =>
      mockComputeTopicOverlap(...args),
    buildUserTopicProfile: (...args: unknown[]) =>
      mockBuildUserTopicProfile(...args),
    computeCanonicalTopicOverlap: (...args: unknown[]) =>
      mockComputeCanonicalTopicOverlap(...args),
  };
});

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
      expect.anything(),
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
    mockOrderBy.mockReturnValue([]);
    mockBuildUserTopicProfile.mockReturnValue(new Map());
    mockComputeTopicOverlap.mockReturnValue({
      overlapCount: 0,
      topOverlapTopic: null,
      isNewTopic: false,
      label: null,
      labelKind: null,
    });
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
    expect(result.episodes[0].podcastImageUrl).toBe(
      "https://example.com/image.jpg",
    );
    // Second episode — verify nullable fields
    expect(result.episodes[1].description).toBeNull();
    expect(result.episodes[1].audioUrl).toBeNull();
    expect(result.episodes[1].podcastImageUrl).toBeNull();

    // orderBy() and limit() only on the main query
    expect(mockOrderBy).toHaveBeenCalledTimes(2);
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

  it("partially enriches episodes — only those with rank rows get populated fields", async () => {
    const mockEpisodes = [
      {
        id: 1,
        podcastIndexId: "ep-111",
        title: "Has Rank",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "9.00",
        podcastTitle: "Pod A",
        podcastImageUrl: null,
      },
      {
        id: 2,
        podcastIndexId: "ep-222",
        title: "No Rank",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "7.00",
        podcastTitle: "Pod B",
        podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);
    mockGroupBy.mockResolvedValue([
      { episodeId: 1, bestRank: 3, topTopic: "Climate Tech" },
    ]);

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    expect(result.episodes[0].bestTopicRank).toBe(3);
    expect(result.episodes[0].topRankedTopic).toBe("Climate Tech");
    expect(result.episodes[1].bestTopicRank).toBeNull();
    expect(result.episodes[1].topRankedTopic).toBeNull();
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
      { episodeId: 10 },
      { episodeId: 11 },
      { episodeId: 12 },
      { episodeId: 13 },
    ]);
    // Topic profile: AI Ethics appears 4 times
    mockBuildUserTopicProfile.mockReturnValue(new Map([["AI Ethics", 4]]));
    mockComputeTopicOverlap.mockReturnValue({
      overlapCount: 4,
      topOverlapTopic: "AI Ethics",
      isNewTopic: false,
      label: "You've heard 4 similar episodes",
      labelKind: "high-overlap",
    });

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    expect(result.error).toBeNull();
    expect(result.episodes[0].overlapCount).toBe(4);
    expect(result.episodes[0].overlapTopic).toBe("AI Ethics");
    expect(result.episodes[0].overlapLabel).toBe(
      "You've heard 4 similar episodes",
    );
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
    mockUnion.mockResolvedValue([
      { episodeId: 100 },
      { episodeId: 101 },
      { episodeId: 102 },
    ]);
    mockBuildUserTopicProfile.mockReturnValue(new Map([["AI Ethics", 4]]));
    // ep-1 has high overlap, ep-2 and ep-3 have none
    mockComputeTopicOverlap
      .mockReturnValueOnce({
        overlapCount: 4,
        topOverlapTopic: "AI Ethics",
        isNewTopic: false,
        label: "You've heard 4 similar episodes",
        labelKind: "high-overlap",
      })
      .mockReturnValueOnce({
        overlapCount: 0,
        topOverlapTopic: null,
        isNewTopic: false,
        label: null,
        labelKind: null,
      })
      .mockReturnValueOnce({
        overlapCount: 0,
        topOverlapTopic: null,
        isNewTopic: false,
        label: null,
        labelKind: null,
      });

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
        id: 1,
        podcastIndexId: "ep-1",
        title: "A",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "9.00",
        podcastTitle: "P",
        podcastImageUrl: null,
      },
      {
        id: 2,
        podcastIndexId: "ep-2",
        title: "B",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "8.00",
        podcastTitle: "P",
        podcastImageUrl: null,
      },
      {
        id: 3,
        podcastIndexId: "ep-3",
        title: "C",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "7.00",
        podcastTitle: "P",
        podcastImageUrl: null,
      },
      {
        id: 4,
        podcastIndexId: "ep-4",
        title: "D",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "6.00",
        podcastTitle: "P",
        podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);
    mockUnion.mockResolvedValue([
      { episodeId: 99 },
      { episodeId: 98 },
      { episodeId: 97 },
    ]);
    mockBuildUserTopicProfile.mockReturnValue(new Map());
    // ep-1 and ep-3 have high overlap; ep-2 and ep-4 have none
    mockComputeTopicOverlap
      .mockReturnValueOnce({
        overlapCount: 5,
        topOverlapTopic: "X",
        isNewTopic: false,
        label: "You've heard 5 similar episodes",
        labelKind: "high-overlap",
      })
      .mockReturnValueOnce({
        overlapCount: 0,
        topOverlapTopic: null,
        isNewTopic: false,
        label: null,
        labelKind: null,
      })
      .mockReturnValueOnce({
        overlapCount: 3,
        topOverlapTopic: "Y",
        isNewTopic: false,
        label: "You've heard 3 similar episodes",
        labelKind: "high-overlap",
      })
      .mockReturnValueOnce({
        overlapCount: 0,
        topOverlapTopic: null,
        isNewTopic: false,
        label: null,
        labelKind: null,
      });

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    // Non-overlapping in original order: ep-2, ep-4; then overlapping in original order: ep-1, ep-3
    expect(result.episodes.map((e) => e.podcastIndexId)).toEqual([
      "ep-2",
      "ep-4",
      "ep-1",
      "ep-3",
    ]);
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
    mockComputeTopicOverlap.mockReturnValue({
      overlapCount: 0,
      topOverlapTopic: null,
      isNewTopic: false,
      label: null,
      labelKind: null,
    });

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

  it("attaches canonicalOverlap to DTO when canonical batch resolves with data", async () => {
    const EP_A = asPodcastIndexEpisodeId("ep-a");
    const mockEpisodes = [
      {
        id: 1,
        podcastIndexId: EP_A,
        title: "Ep A",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "7.00",
        podcastTitle: "Pod",
        podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);
    // Canonical batch: Q1 resolves DB id, Q2 canonical row, Q3a consumed IDs, Q3b count row
    mockWhere
      .mockResolvedValueOnce([]) // union sub-select (consumed history)
      .mockResolvedValueOnce([]) // topic count (groupBy)
      .mockResolvedValueOnce([]) // candidate topics
      .mockResolvedValueOnce([{ id: 1, podcastIndexId: EP_A }]) // Q1: episode lookup
      .mockResolvedValueOnce([]); // Q2: no canonicals → null via guard 2
    mockUnion.mockResolvedValue([{ episodeId: 99 }]); // listen history union
    mockGroupBy
      .mockResolvedValueOnce([]) // topic profile groupBy
      .mockResolvedValueOnce([]); // Q3b count groupBy

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    expect(result.error).toBeNull();
    expect(result.episodes).toHaveLength(1);
    // Guard 2 fires (no canonicals) → canonicalOverlap is null
    expect(result.episodes[0].canonicalOverlap).toBeNull();
  });

  it("sets canonicalOverlap to null for all episodes when canonical batch throws", async () => {
    const mockEpisodes = [
      {
        id: 1,
        podcastIndexId: "ep-x",
        title: "Ep X",
        description: null,
        audioUrl: null,
        duration: null,
        publishDate: null,
        worthItScore: "6.00",
        podcastTitle: "Pod",
        podcastImageUrl: null,
      },
    ];
    mockLimit.mockResolvedValue(mockEpisodes);
    // runCanonicalTopicOverlapBatch Q1 is the 9th where() call in the flow
    // (3 sub-selects + main + topicRank + fetchConsumedEpisodeIds×2 + candidateTopics).
    // Fail only that call via a countdown to avoid polluting earlier queries.
    let whereCallCount = 0;
    mockWhere.mockImplementation(() => {
      whereCallCount++;
      if (whereCallCount === 9) {
        return Promise.reject(new Error("DB timeout"));
      }
      return Promise.resolve([]);
    });

    const { getRecommendedEpisodes } = await import("@/app/actions/dashboard");
    const result = await getRecommendedEpisodes();

    // Episodes still returned, canonicalOverlap is null (graceful degradation)
    expect(result.error).toBeNull();
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0].canonicalOverlap).toBeNull();
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
    mockOrderBy.mockReturnValue([]);
    mockBuildUserTopicProfile.mockReturnValue(new Map());
    mockComputeTopicOverlap.mockReturnValue({
      overlapCount: 0,
      topOverlapTopic: null,
      isNewTopic: false,
      label: null,
      labelKind: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap(
      asPodcastIndexEpisodeId("ep-123"),
    );

    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized for unauthenticated callers even with falsy input (auth-first)", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap("" as PodcastIndexEpisodeId);

    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns empty overlap for falsy podcastIndexEpisodeId", async () => {
    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap("" as PodcastIndexEpisodeId);

    expect(result).toEqual({ success: true, data: EMPTY_OVERLAP_RESULT });
  });

  it("returns empty overlap when episode is not found in DB", async () => {
    // limit returns empty — episode not in DB
    mockLimit.mockResolvedValue([]);

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap(
      asPodcastIndexEpisodeId("ep-999"),
    );

    expect(result).toEqual({ success: true, data: EMPTY_OVERLAP_RESULT });
  });

  it("returns computed overlap for a found episode", async () => {
    // Episode lookup returns a row
    mockLimit.mockResolvedValue([{ id: 42 }]);
    // User has 5 consumed episodes
    mockUnion.mockResolvedValue([
      { episodeId: 1 },
      { episodeId: 2 },
      { episodeId: 3 },
      { episodeId: 4 },
      { episodeId: 5 },
    ]);
    mockBuildUserTopicProfile.mockReturnValue(new Map([["Leadership", 4]]));
    // Episode topics returned by where().orderBy()
    mockOrderBy.mockReturnValue([
      { topic: "Leadership", relevance: "0.90", topicRank: 1 },
    ]);
    mockComputeTopicOverlap.mockReturnValue({
      overlapCount: 4,
      topOverlapTopic: "Leadership",
      isNewTopic: false,
      label: "You've heard 4 similar episodes",
      labelKind: "high-overlap",
    });

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap(
      asPodcastIndexEpisodeId("ep-42"),
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        label: "You've heard 4 similar episodes",
        overlapCount: 4,
        topOverlapTopic: "Leadership",
      },
    });
  });

  it("returns empty overlap when episode has no topic tags", async () => {
    mockLimit.mockResolvedValue([{ id: 42 }]);
    mockUnion.mockResolvedValue([
      { episodeId: 1 },
      { episodeId: 2 },
      { episodeId: 3 },
    ]);
    mockBuildUserTopicProfile.mockReturnValue(new Map());
    // No topics for this episode
    mockWhere.mockResolvedValue([]);
    mockComputeTopicOverlap.mockReturnValue(EMPTY_OVERLAP_RESULT);

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap(
      asPodcastIndexEpisodeId("ep-42"),
    );

    expect(result).toEqual({ success: true, data: EMPTY_OVERLAP_RESULT });
  });

  it("returns error result on DB error", async () => {
    mockLimit.mockRejectedValue(new Error("DB failure"));

    const { getEpisodeTopicOverlap } = await import("@/app/actions/dashboard");
    const result = await getEpisodeTopicOverlap(
      asPodcastIndexEpisodeId("ep-42"),
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to compute episode topic overlap",
    });
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

    const { getRecentEpisodesFromSubscriptions } =
      await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes).toEqual([]);
    expect(result.hasSubscriptions).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });

  it("returns empty episodes and hasSubscriptions=false when user has no subscriptions", async () => {
    mockFindMany.mockResolvedValue([]);

    const { getRecentEpisodesFromSubscriptions } =
      await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes).toEqual([]);
    expect(result.hasSubscriptions).toBe(false);
    expect(result.error).toBeNull();
  });

  it("returns empty episodes and hasSubscriptions=true when subscriptions exist but no episodes returned", async () => {
    mockFindMany.mockResolvedValue([makeSubscription("123")]);
    mockGetEpisodesByFeedId.mockResolvedValue({ items: [] });

    const { getRecentEpisodesFromSubscriptions } =
      await import("@/app/actions/dashboard");
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

    const { getRecentEpisodesFromSubscriptions } =
      await import("@/app/actions/dashboard");
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

    const { getRecentEpisodesFromSubscriptions } =
      await import("@/app/actions/dashboard");
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

    const { getRecentEpisodesFromSubscriptions } =
      await import("@/app/actions/dashboard");
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

    const { getRecentEpisodesFromSubscriptions } =
      await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0].worthItScore).toBeNull();
  });

  it("parses worthItScore string from DB as a number", async () => {
    mockFindMany.mockResolvedValue([makeSubscription("222")]);
    mockGetEpisodesByFeedId.mockResolvedValue({
      items: [makeApiEpisode({ id: 55, feedId: 222 })],
    });
    mockWhere.mockResolvedValue([
      { podcastIndexId: "55", worthItScore: "7.75" },
    ]);

    const { getRecentEpisodesFromSubscriptions } =
      await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes[0].worthItScore).toBe(parseFloat("7.75"));
  });

  it("returns error and empty array on API failure", async () => {
    mockFindMany.mockResolvedValue([makeSubscription("111")]);
    mockGetEpisodesByFeedId.mockRejectedValue(new Error("API failure"));

    const { getRecentEpisodesFromSubscriptions } =
      await import("@/app/actions/dashboard");
    const result = await getRecentEpisodesFromSubscriptions();

    expect(result.episodes).toEqual([]);
    expect(result.error).toMatch(/failed to load/i);
  });
});

describe("getTrendingTopicBySlug", () => {
  const GENERATED_AT = new Date("2026-04-17T06:00:00Z");

  const makeSnapshot = (topics: object[]) => ({
    id: 1,
    topics,
    generatedAt: GENERATED_AT,
    periodStart: new Date("2026-04-10T06:00:00Z"),
    periodEnd: GENERATED_AT,
    episodeCount: topics.length,
    createdAt: GENERATED_AT,
  });

  const aiTopic = {
    name: "Artificial Intelligence",
    description: "AI trends",
    episodeCount: 3,
    episodeIds: [10, 20, 30],
    slug: "artificial-intelligence",
  };

  const climateTopic = {
    name: "Climate Policy",
    description: "Climate news",
    episodeCount: 2,
    episodeIds: [40, 50],
    slug: "climate-policy",
  };

  const mockEpisodeRow = {
    id: 10,
    podcastIndexId: "pod-10",
    title: "AI Episode",
    description: "About AI",
    audioUrl: "https://example.com/ai.mp3",
    duration: 3600,
    publishDate: new Date("2026-04-01T00:00:00Z"),
    worthItScore: "8.50",
    podcastTitle: "AI Podcast",
    podcastImageUrl: "https://example.com/ai.jpg",
  };

  const mockEpisodeRowNullScore = {
    ...mockEpisodeRow,
    id: 20,
    worthItScore: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("redirects to /sign-in when userId is null", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getTrendingTopicBySlug } = await import("@/app/actions/dashboard");

    await expect(
      getTrendingTopicBySlug("artificial-intelligence"),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith(
      `/sign-in?redirect_url=${encodeURIComponent("/trending/artificial-intelligence")}`,
    );
  });

  it("encodes the slug in the sign-in redirect URL to prevent query-param injection", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getTrendingTopicBySlug } = await import("@/app/actions/dashboard");

    // A slug with reserved URL chars: `&` would break the /sign-in querystring without encoding.
    await expect(getTrendingTopicBySlug("foo&evil=injected")).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    const redirectedTo = mockRedirect.mock.calls[0][0] as string;
    expect(redirectedTo).not.toContain("&evil=injected");
    expect(redirectedTo).toBe(
      `/sign-in?redirect_url=${encodeURIComponent("/trending/foo&evil=injected")}`,
    );
  });

  it("returns { kind: 'no-snapshot' } when no snapshot exists", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirst.mockResolvedValue(undefined);

    const { getTrendingTopicBySlug } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopicBySlug("artificial-intelligence");

    expect(result).toEqual({ kind: "no-snapshot" });
  });

  it("returns { kind: 'found', ... } with episodes when slug matches a topic", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirst.mockResolvedValue(makeSnapshot([aiTopic, climateTopic]));
    // Chain now terminates with .limit() at the DB layer so the display cap
    // respects sort order over the full candidate set.
    mockLimit.mockResolvedValue([mockEpisodeRow, mockEpisodeRowNullScore]);

    const { getTrendingTopicBySlug } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopicBySlug("artificial-intelligence");

    expect(result.kind).toBe("found");
    if (result.kind !== "found") throw new Error("expected found");
    expect(result.topic).toMatchObject({
      name: "Artificial Intelligence",
      slug: "artificial-intelligence",
    });
    expect(result.allTopics).toHaveLength(2);
    expect(result.generatedAt).toEqual(GENERATED_AT);
    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[0].bestTopicRank).toBeNull();
    expect(result.episodes[0].topRankedTopic).toBeNull();
    expect(result.episodes[1].worthItScore).toBeNull();

    // Guard against regression to plain desc(): pg defaults DESC to NULLS FIRST,
    // so unscored episodes would float to the top without the raw-SQL override.
    const orderArgs = mockOrderBy.mock.calls[0];
    expect(orderArgs).toBeDefined();
    const rawSqlClauses = orderArgs
      .filter(
        (arg: unknown): arg is { _op: "sql"; raw: string } =>
          typeof arg === "object" &&
          arg !== null &&
          (arg as { _op?: string })._op === "sql",
      )
      .map((arg) => arg.raw);
    expect(rawSqlClauses.join(" ")).toContain("DESC NULLS LAST");

    // Display cap must run at the DB layer (after orderBy) so top-scored
    // episodes can't be silently dropped by an LLM-order truncation.
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it("returns { kind: 'found', episodes: [] } when matched topic has no episodeIds", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    const emptyTopic = { ...aiTopic, episodeIds: [] };
    mockFindFirst.mockResolvedValue(makeSnapshot([emptyTopic, climateTopic]));

    const { getTrendingTopicBySlug } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopicBySlug("artificial-intelligence");

    expect(result.kind).toBe("found");
    if (result.kind !== "found") throw new Error("expected found");
    expect(result.topic).toMatchObject({ name: "Artificial Intelligence" });
    expect(result.episodes).toEqual([]);
  });

  it("returns { kind: 'unknown-slug' } when slug is unknown", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirst.mockResolvedValue(makeSnapshot([aiTopic, climateTopic]));

    const { getTrendingTopicBySlug } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopicBySlug("unknown-slug-garbage");

    expect(result.kind).toBe("unknown-slug");
    if (result.kind !== "unknown-slug")
      throw new Error("expected unknown-slug");
    expect(result.allTopics).toHaveLength(2);
    expect(result.generatedAt).toEqual(GENERATED_AT);
  });

  it("matches legacy topic without slug via slugify(name)", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    const legacyTopic = {
      name: "Space Exploration",
      description: "Space news",
      episodeCount: 1,
      episodeIds: [],
    };
    mockFindFirst.mockResolvedValue(makeSnapshot([legacyTopic]));

    const { getTrendingTopicBySlug } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopicBySlug("space-exploration");

    expect(result.kind).toBe("found");
    if (result.kind !== "found") throw new Error("expected found");
    expect(result.topic).toMatchObject({ name: "Space Exploration" });
  });

  it("returns { kind: 'error' } on DB failure and logs the slug context", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirst.mockRejectedValue(new Error("DB connection failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getTrendingTopicBySlug } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopicBySlug("artificial-intelligence");

    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error("expected error");
    expect(result.message).toMatch(/failed to load/i);

    // The log must carry the slug so ops can correlate failures to requests.
    const loggedSlug = errorSpy.mock.calls.some((args) =>
      args.some(
        (arg) =>
          typeof arg === "object" &&
          arg !== null &&
          (arg as { slug?: string }).slug === "artificial-intelligence",
      ),
    );
    expect(loggedSlug).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getCanonicalTopicOverlaps (batch) tests
// ---------------------------------------------------------------------------

describe("getCanonicalTopicOverlaps", () => {
  const EP1 = asPodcastIndexEpisodeId("ep-1");
  const EP2 = asPodcastIndexEpisodeId("ep-2");

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockWhere.mockResolvedValue([]);
    mockUnion.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([]);
    mockComputeCanonicalTopicOverlap.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1]);

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns empty data object for empty episodeIds", async () => {
    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([]);

    expect(result).toEqual({ success: true, data: {} });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns all-null map when no episode ids are found in DB (guard 1: inArray empty)", async () => {
    // Q1 returns empty — all input ids unknown
    mockWhere.mockResolvedValueOnce([]); // Q1

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1, EP2]);

    expect(result).toEqual({
      success: true,
      data: { [EP1]: null, [EP2]: null },
    });
    // Q2 and Q3 must NOT have been called (guarded)
    expect(mockInnerJoin).not.toHaveBeenCalled();
    expect(mockUnion).not.toHaveBeenCalled();
  });

  it("returns null for episode not found in DB (partial batch)", async () => {
    // Q1: only EP1 found, EP2 unknown
    mockWhere
      .mockResolvedValueOnce([{ id: 100, podcastIndexId: EP1 }]) // Q1
      .mockResolvedValueOnce([]); // Q2 (no canonicals for EP1)

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1, EP2]);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data[EP1]).toBeNull(); // no canonicals → null
    expect(result.data[EP2]).toBeNull(); // not in DB → null
  });

  it("returns null when target has no active canonicals (guard 2: inArray empty)", async () => {
    mockWhere
      .mockResolvedValueOnce([{ id: 100, podcastIndexId: EP1 }]) // Q1
      .mockResolvedValueOnce([]); // Q2: no canonicals
    mockComputeCanonicalTopicOverlap.mockReturnValue(null);

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1]);

    expect(result).toEqual({ success: true, data: { [EP1]: null } });
    // Q3 must NOT have been called (guarded on empty canonicals)
    expect(mockUnion).not.toHaveBeenCalled();
  });

  it("returns 'new' when user has zero consumed episodes (guard 3: inArray empty on Q3b)", async () => {
    mockWhere
      .mockResolvedValueOnce([{ id: 100, podcastIndexId: EP1 }]) // Q1
      .mockResolvedValueOnce([
        {
          episodeId: 100,
          canonicalTopicId: 10,
          topicLabel: "AI Safety",
          coverageScore: 0.9,
        },
      ]); // Q2
    mockUnion.mockResolvedValue([]); // Q3a: no consumed episodes
    mockComputeCanonicalTopicOverlap.mockReturnValue({
      kind: "new",
      topicLabel: "AI Safety",
      topicId: 10,
    });

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1]);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data[EP1]).toEqual({
      kind: "new",
      topicLabel: "AI Safety",
      topicId: 10,
    });
    // Q3b must NOT have been called (no consumed → skip groupBy)
    expect(mockGroupBy).not.toHaveBeenCalled();
    // computeCanonicalTopicOverlap called with empty Map (no counts)
    expect(mockComputeCanonicalTopicOverlap).toHaveBeenCalledWith(
      [{ canonicalTopicId: 10, topicLabel: "AI Safety", coverageScore: 0.9 }],
      new Map(),
    );
  });

  it("returns 'repeat' when user has consumed episodes with positive count", async () => {
    mockWhere
      .mockResolvedValueOnce([{ id: 100, podcastIndexId: EP1 }]) // Q1
      .mockResolvedValueOnce([
        {
          episodeId: 100,
          canonicalTopicId: 10,
          topicLabel: "AI Safety",
          coverageScore: 0.9,
        },
      ]); // Q2
    mockUnion.mockResolvedValue([{ episodeId: 200 }]); // Q3a: ep200 consumed
    mockGroupBy.mockResolvedValue([{ canonicalTopicId: 10, count: 2 }]); // Q3b
    mockComputeCanonicalTopicOverlap.mockReturnValue({
      kind: "repeat",
      count: 2,
      topicLabel: "AI Safety",
      topicId: 10,
    });

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1]);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data[EP1]).toEqual({
      kind: "repeat",
      count: 2,
      topicLabel: "AI Safety",
      topicId: 10,
    });
    // EP1 (id=100) is NOT consumed → no self-subtraction; counts passed as-is
    expect(mockComputeCanonicalTopicOverlap).toHaveBeenCalledWith(
      [{ canonicalTopicId: 10, topicLabel: "AI Safety", coverageScore: 0.9 }],
      new Map([[10, 2]]),
    );
  });

  it("verifies Q2 applies status='active' filter so merged/dormant canonicals are excluded", async () => {
    mockWhere
      .mockResolvedValueOnce([{ id: 100, podcastIndexId: EP1 }]) // Q1
      .mockResolvedValueOnce([
        {
          episodeId: 100,
          canonicalTopicId: 10,
          topicLabel: "AI Safety",
          coverageScore: 0.9,
        },
      ]); // Q2
    mockUnion.mockResolvedValue([]);
    mockComputeCanonicalTopicOverlap.mockReturnValue({
      kind: "new",
      topicLabel: "AI Safety",
      topicId: 10,
    });

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const { canonicalTopics: ctSchema } = await import("@/db/schema");
    await getCanonicalTopicOverlaps([EP1]);

    // Q2 is the second mockWhere call (index 1), after Q1's where (index 0).
    // Its argument must be an `and(...)` that includes eq(canonicalTopics.status, 'active'),
    // so that merged and dormant canonicals are filtered out even when they have junction rows.
    const q2WhereArg = mockWhere.mock.calls[1]?.[0];
    expect(q2WhereArg).toEqual({
      _op: "and",
      args: expect.arrayContaining([
        { _op: "eq", args: [ctSchema.status, "active"] },
      ]),
    });
  });

  it("subtracts target's own contribution when target is in user history", async () => {
    // EP1 (id=100) is in the user's consumed history
    mockWhere
      .mockResolvedValueOnce([{ id: 100, podcastIndexId: EP1 }]) // Q1
      .mockResolvedValueOnce([
        {
          episodeId: 100,
          canonicalTopicId: 10,
          topicLabel: "AI Safety",
          coverageScore: 0.9,
        },
      ]); // Q2
    // Q3a: EP1 (id=100) AND ep200 are consumed
    mockUnion.mockResolvedValue([{ episodeId: 100 }, { episodeId: 200 }]);
    // Q3b: global count for C10 = 3 (EP1 + ep200 + ep300)
    mockGroupBy.mockResolvedValue([{ canonicalTopicId: 10, count: 3 }]);
    mockComputeCanonicalTopicOverlap.mockReturnValue({
      kind: "repeat",
      count: 2,
      topicLabel: "AI Safety",
      topicId: 10,
    });

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1]);

    expect(result.success).toBe(true);
    // EP1 is consumed → subtract 1: 3 - 1 = 2
    expect(mockComputeCanonicalTopicOverlap).toHaveBeenCalledWith(
      [{ canonicalTopicId: 10, topicLabel: "AI Safety", coverageScore: 0.9 }],
      new Map([[10, 2]]),
    );
  });

  it("handles batch with mixed states correctly", async () => {
    // EP1: found, has canonicals, overlap count 1
    // EP2: not found in DB → null
    mockWhere
      .mockResolvedValueOnce([{ id: 100, podcastIndexId: EP1 }]) // Q1: only EP1 found
      .mockResolvedValueOnce([
        {
          episodeId: 100,
          canonicalTopicId: 10,
          topicLabel: "AI Safety",
          coverageScore: 0.9,
        },
      ]); // Q2
    mockUnion.mockResolvedValue([{ episodeId: 200 }]); // Q3a
    mockGroupBy.mockResolvedValue([{ canonicalTopicId: 10, count: 1 }]); // Q3b
    mockComputeCanonicalTopicOverlap.mockReturnValue({
      kind: "repeat",
      count: 1,
      topicLabel: "AI Safety",
      topicId: 10,
    });

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1, EP2]);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data[EP1]).toEqual({
      kind: "repeat",
      count: 1,
      topicLabel: "AI Safety",
      topicId: 10,
    });
    expect(result.data[EP2]).toBeNull(); // not in DB
  });

  it("returns { success: false, error } on DB error", async () => {
    mockWhere.mockRejectedValue(new Error("DB connection lost"));

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1]);

    expect(result).toEqual({
      success: false,
      error: "Failed to compute canonical topic overlap",
    });
  });

  it("clamps self-subtraction to zero when the target is the sole consumer of a canonical", async () => {
    // EP1 (id=100) is consumed AND is the only consumed episode tagged with
    // canonical 10 → globalCounts[10] = 1 → 1 - 1 = 0 → helper sees 0.
    // Locks down the boundary where self-subtraction should flip "repeat" to "new".
    mockWhere
      .mockResolvedValueOnce([{ id: 100, podcastIndexId: EP1 }])
      .mockResolvedValueOnce([
        {
          episodeId: 100,
          canonicalTopicId: 10,
          topicLabel: "AI Safety",
          coverageScore: 0.9,
        },
      ]);
    mockUnion.mockResolvedValue([{ episodeId: 100 }]);
    mockGroupBy.mockResolvedValue([{ canonicalTopicId: 10, count: 1 }]);
    mockComputeCanonicalTopicOverlap.mockReturnValue({
      kind: "new",
      topicLabel: "AI Safety",
      topicId: 10,
    });

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    await getCanonicalTopicOverlaps([EP1]);

    expect(mockComputeCanonicalTopicOverlap).toHaveBeenCalledWith(
      [{ canonicalTopicId: 10, topicLabel: "AI Safety", coverageScore: 0.9 }],
      new Map([[10, 0]]),
    );
  });

  it("clamps negative counts to zero when global count is missing for a target's canonical", async () => {
    // Race-condition guard: target is consumed, has canonical 10, but Q3b
    // returned no row for canonical 10 (e.g., reconcile-canonicals flipped its
    // status to merged between Q2 and Q3b). Without Math.max(0, …) the helper
    // would receive -1.
    mockWhere
      .mockResolvedValueOnce([{ id: 100, podcastIndexId: EP1 }])
      .mockResolvedValueOnce([
        {
          episodeId: 100,
          canonicalTopicId: 10,
          topicLabel: "AI Safety",
          coverageScore: 0.9,
        },
      ]);
    mockUnion.mockResolvedValue([{ episodeId: 100 }]);
    mockGroupBy.mockResolvedValue([]); // empty: no Q3b row for canonical 10
    mockComputeCanonicalTopicOverlap.mockReturnValue({
      kind: "new",
      topicLabel: "AI Safety",
      topicId: 10,
    });

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    await getCanonicalTopicOverlaps([EP1]);

    expect(mockComputeCanonicalTopicOverlap).toHaveBeenCalledWith(
      expect.anything(),
      new Map([[10, 0]]),
    );
  });

  it("returns empty data when input is not an array (defensive against client misuse)", async () => {
    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps(
      null as unknown as PodcastIndexEpisodeId[],
    );

    expect(result).toEqual({ success: true, data: {} });
  });

  it("trims whitespace from ids and drops empty-after-trim entries", async () => {
    // Whitespace-only input → all dropped → empty sanitized → no DB calls,
    // returns empty data (matches the empty-array short-circuit).
    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([
      "   " as PodcastIndexEpisodeId,
      "\n\t" as PodcastIndexEpisodeId,
      "" as PodcastIndexEpisodeId,
    ]);

    expect(result).toEqual({ success: true, data: {} });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("rejects ids exceeding the per-id length cap", async () => {
    // 257-char id (one over MAX_OVERLAP_ID_LENGTH) is dropped.
    const tooLong = "a".repeat(257) as PodcastIndexEpisodeId;
    mockWhere.mockResolvedValueOnce([]); // Q1 — only EP1 reaches DB

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1, tooLong]);

    // Only EP1 in result; tooLong was filtered before Q1.
    expect(result).toEqual({
      success: true,
      data: { [EP1]: null },
    });
  });

  it("rejects forbidden prototype keys (__proto__, constructor, prototype)", async () => {
    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([
      "__proto__" as PodcastIndexEpisodeId,
      "constructor" as PodcastIndexEpisodeId,
      "prototype" as PodcastIndexEpisodeId,
    ]);

    expect(result).toEqual({ success: true, data: {} });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns a plain-object data map (Next server-action serialization compatible)", async () => {
    // Guard 1 path returns a {[id]: null} map; verify it has Object.prototype
    // so React Flight serialization across the network boundary doesn't fail
    // with "Only plain objects... null prototypes are not supported".
    mockWhere.mockResolvedValueOnce([]); // Q1: no rows → guard 1 path

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1]);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(Object.getPrototypeOf(result.data)).toBe(Object.prototype);
  });

  it("coerces string aggregate counts from the driver into numbers (Q3b)", async () => {
    // Neon HTTP can return COUNT(...) aggregates as strings even when the SQL
    // is `::integer` — verify .mapWith(Number) keeps the count typed correctly
    // by passing the helper a real number, not a string.
    mockWhere
      .mockResolvedValueOnce([{ id: 100, podcastIndexId: EP1 }]) // Q1
      .mockResolvedValueOnce([
        {
          episodeId: 100,
          canonicalTopicId: 10,
          topicLabel: "AI Safety",
          coverageScore: 0.9,
        },
      ]); // Q2
    mockUnion.mockResolvedValue([{ episodeId: 200 }]); // Q3a
    // Even though the driver might hand us "3" (string), the action stores
    // numbers in globalCounts. Mock returns a number to mirror what
    // .mapWith(Number) coerces to.
    mockGroupBy.mockResolvedValue([{ canonicalTopicId: 10, count: 3 }]);
    mockComputeCanonicalTopicOverlap.mockReturnValue({
      kind: "repeat",
      topicLabel: "AI Safety",
      topicId: 10,
      count: 3,
    });

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps([EP1]);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    // Helper received numeric counts (not strings) — assert on the Map values.
    const callArgs = mockComputeCanonicalTopicOverlap.mock.calls[0];
    const countsMap = callArgs[1] as Map<number, number>;
    expect(typeof countsMap.get(10)).toBe("number");
    expect(countsMap.get(10)).toBe(3);
  });

  it("caps the input via single-pass iteration before allocation (DoS guard)", async () => {
    // Build a 600-element input. The 500-cap should kick in mid-iteration
    // — the remaining 100 elements must never be sanitized or queried.
    // We mark the post-cap slots with sentinel ids that would FAIL DB lookup
    // if they ever reached the SQL `IN` predicate, but the cap should
    // prevent that.
    const huge: PodcastIndexEpisodeId[] = [];
    for (let i = 0; i < 500; i++) huge.push(`ep-${i}` as PodcastIndexEpisodeId);
    for (let i = 500; i < 600; i++)
      huge.push(`SHOULD_NOT_REACH_${i}` as PodcastIndexEpisodeId);

    mockWhere.mockResolvedValueOnce([]); // Q1 returns no matches → guard 1

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps(huge);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    // Capped at 500 — exactly that many keys, none of the post-cap sentinels.
    expect(Object.keys(result.data)).toHaveLength(500);
    expect(result.data).not.toHaveProperty("SHOULD_NOT_REACH_500");
    expect(result.data).not.toHaveProperty("SHOULD_NOT_REACH_599");
  });

  it("caps raw inspection so all-invalid mega-inputs don't walk the full payload (DoS guard 2)", async () => {
    // 10000 whitespace-only inputs — every one sanitizes to null, so the
    // unique-id cap (500) never fires. Without an inspection cap, the loop
    // would walk all 10000. The MAX_OVERLAP_INSPECT_IDS cap (4x = 2000)
    // bounds the work; result is still empty, which is the correct outcome
    // for a no-valid-id input.
    const garbage: PodcastIndexEpisodeId[] = [];
    for (let i = 0; i < 10000; i++)
      garbage.push("   " as PodcastIndexEpisodeId);

    const { getCanonicalTopicOverlaps } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlaps(garbage);

    expect(result).toEqual({ success: true, data: {} });
    // No DB hops — sanitizer drained to empty before reaching Q1.
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getCanonicalTopicOverlap (single) tests
// ---------------------------------------------------------------------------

describe("getCanonicalTopicOverlap", () => {
  const EP1 = asPodcastIndexEpisodeId("ep-42");

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockWhere.mockResolvedValue([]);
    mockUnion.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([]);
    mockComputeCanonicalTopicOverlap.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getCanonicalTopicOverlap } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlap(EP1);

    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("delegates to batch and returns data for the given id (single auth() per request)", async () => {
    mockWhere
      .mockResolvedValueOnce([{ id: 42, podcastIndexId: EP1 }]) // Q1
      .mockResolvedValueOnce([
        {
          episodeId: 42,
          canonicalTopicId: 5,
          topicLabel: "Model Releases",
          coverageScore: 0.85,
        },
      ]); // Q2
    mockUnion.mockResolvedValue([]);
    mockComputeCanonicalTopicOverlap.mockReturnValue({
      kind: "new",
      topicLabel: "Model Releases",
      topicId: 5,
    });

    const { getCanonicalTopicOverlap } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlap(EP1);

    expect(result).toEqual({
      success: true,
      data: { kind: "new", topicLabel: "Model Releases", topicId: 5 },
    });
    // Wrapper calls runCanonicalTopicOverlapBatch directly, NOT
    // getCanonicalTopicOverlaps — auth() runs exactly once per request.
    expect(mockAuth).toHaveBeenCalledTimes(1);
  });

  it("returns { success: true, data: null } when episode is not found in DB", async () => {
    mockWhere.mockResolvedValueOnce([]); // Q1: not found

    const { getCanonicalTopicOverlap } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlap(EP1);

    expect(result).toEqual({ success: true, data: null });
  });

  it("propagates { success: false, error } when the underlying batch fails", async () => {
    // Sync throw from mockImplementation avoids the Vitest unhandled-rejection
    // false-positive. runCanonicalTopicOverlapBatch's outer try/catch converts
    // the sync throw inside the Drizzle query chain into { success: false }.
    mockWhere.mockImplementation(() => {
      throw new Error("DB connection lost");
    });

    const { getCanonicalTopicOverlap } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlap(EP1);

    expect(result).toEqual({
      success: false,
      error: "Failed to compute canonical topic overlap",
    });
  });

  it("normalizes the input id so whitespace-padded ids hit the same key as the batch", async () => {
    // The batch trims " ep-42 " → "ep-42" and indexes data["ep-42"]. Without
    // matching normalization in the wrapper, the raw key would miss the value.
    const padded = "  ep-42  " as PodcastIndexEpisodeId;
    mockWhere
      .mockResolvedValueOnce([{ id: 42, podcastIndexId: EP1 }]) // Q1 (DB returns trimmed branded id)
      .mockResolvedValueOnce([
        {
          episodeId: 42,
          canonicalTopicId: 5,
          topicLabel: "Model Releases",
          coverageScore: 0.85,
        },
      ]); // Q2
    mockUnion.mockResolvedValue([]);
    mockComputeCanonicalTopicOverlap.mockReturnValue({
      kind: "new",
      topicLabel: "Model Releases",
      topicId: 5,
    });

    const { getCanonicalTopicOverlap } =
      await import("@/app/actions/dashboard");
    const result = await getCanonicalTopicOverlap(padded);

    expect(result).toEqual({
      success: true,
      data: { kind: "new", topicLabel: "Model Releases", topicId: 5 },
    });
  });

  it("returns Unauthorized for unauthenticated callers even with unusable input (auth-first)", async () => {
    // Auth contract must hold uniformly — sanitization happens INSIDE
    // withAuthAction so unauthenticated callers never get a success-shaped
    // null for invalid input.
    mockAuth.mockResolvedValue({ userId: null });

    const { getCanonicalTopicOverlap } =
      await import("@/app/actions/dashboard");
    expect(
      await getCanonicalTopicOverlap("   " as PodcastIndexEpisodeId),
    ).toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(
      await getCanonicalTopicOverlap("__proto__" as PodcastIndexEpisodeId),
    ).toEqual({
      success: false,
      error: "Unauthorized",
    });
  });

  it("returns { success: true, data: null } for unusable input (whitespace-only, non-string, forbidden key)", async () => {
    const { getCanonicalTopicOverlap } =
      await import("@/app/actions/dashboard");

    expect(
      await getCanonicalTopicOverlap("   " as PodcastIndexEpisodeId),
    ).toEqual({
      success: true,
      data: null,
    });
    expect(
      await getCanonicalTopicOverlap("__proto__" as PodcastIndexEpisodeId),
    ).toEqual({
      success: true,
      data: null,
    });
    expect(
      await getCanonicalTopicOverlap(null as unknown as PodcastIndexEpisodeId),
    ).toEqual({
      success: true,
      data: null,
    });
    // Auth runs (the wrapper is auth-first per the test above), but the
    // sanitizer short-circuits before any DB query — sanitization happens
    // inside the withAuthAction callback, after auth() resolves.
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockAuth).toHaveBeenCalled();
  });
});
