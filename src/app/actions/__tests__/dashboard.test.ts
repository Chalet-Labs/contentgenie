import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock DB select chain for getRecommendedEpisodes
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockInnerJoin = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();

// Mock database — supports both query API (findFirst/$count) and select chain.
// The select chain must handle two shapes:
//   Subqueries: select().from().where()           (no innerJoin)
//   Main query: select().from().innerJoin().where().orderBy().limit()
const mockFindFirst = vi.fn();
vi.mock("@/db", () => ({
  db: {
    $count: vi.fn(),
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const whereNode = (...wArgs: unknown[]) => {
        mockWhere(...wArgs);
        return {
          orderBy: (...oArgs: unknown[]) => {
            mockOrderBy(...oArgs);
            return {
              limit: (...lArgs: unknown[]) => mockLimit(...lArgs),
            };
          },
        };
      };
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            // Direct where() for subqueries (no innerJoin)
            where: whereNode,
            // innerJoin() for main query
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
}));

// Mock drizzle-orm — include all imports used by dashboard.ts
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _op: "eq", args })),
  desc: vi.fn((...args: unknown[]) => ({ _op: "desc", args })),
  gte: vi.fn((...args: unknown[]) => ({ _op: "gte", args })),
  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
  isNotNull: vi.fn((...args: unknown[]) => ({ _op: "isNotNull", args })),
  notInArray: vi.fn((...args: unknown[]) => ({ _op: "notInArray", args })),
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
    // 3 subqueries + 1 main query = 4 select calls
    expect(mockSelect).toHaveBeenCalledTimes(4);
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

    // Query chain was invoked: 3 subqueries + 1 main query
    expect(mockSelect).toHaveBeenCalledTimes(4);
    // from() called 4 times (once per select)
    expect(mockFrom).toHaveBeenCalledTimes(4);
    // innerJoin() called once (only the main query joins podcasts)
    expect(mockInnerJoin).toHaveBeenCalledTimes(1);
    // where() called 4 times
    expect(mockWhere).toHaveBeenCalledTimes(4);
    // orderBy() and limit() only on the main query
    expect(mockOrderBy).toHaveBeenCalledTimes(1);
    expect(mockLimit).toHaveBeenCalledWith(6);
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
});
