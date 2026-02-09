import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock database
const mockFindFirstPodcast = vi.fn();
const mockFindFirstSubscription = vi.fn();
const mockSelectFrom = vi.fn();
const mockSelectWhere = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      podcasts: { findFirst: (...args: unknown[]) => mockFindFirstPodcast(...args) },
      userSubscriptions: {
        findFirst: (...args: unknown[]) => mockFindFirstSubscription(...args),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    select: vi.fn().mockReturnValue({
      from: (...args: unknown[]) => {
        mockSelectFrom(...args);
        return { where: (...wArgs: unknown[]) => mockSelectWhere(...wArgs) };
      },
    }),
    update: vi.fn().mockReturnValue({
      set: (...args: unknown[]) => {
        mockUpdateSet(...args);
        return { where: (...wArgs: unknown[]) => mockUpdateWhere(...wArgs) };
      },
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue([]),
        }),
      }),
    }),
    batch: (queries: unknown[]) => Promise.resolve(queries),
  },
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  users: { id: "id" },
  podcasts: { id: "id", podcastIndexId: "podcast_index_id", source: "source" },
  episodes: { id: "id", podcastIndexId: "podcast_index_id" },
  userSubscriptions: { userId: "user_id", podcastId: "podcast_id" },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn(),
}));

// Mock RSS parser (needed because subscriptions.ts imports it at top level)
vi.mock("@/lib/rss", async () => {
  const actual = await vi.importActual("@/lib/rss");
  return {
    ...actual,
    parsePodcastFeed: vi.fn(),
  };
});

// Mock PodcastIndex (dynamic import in refreshPodcastFeed)
const mockGetEpisodesByFeedId = vi.fn();
vi.mock("@/lib/podcastindex", () => ({
  getEpisodesByFeedId: (...args: unknown[]) => mockGetEpisodesByFeedId(...args),
}));

// Mock Trigger.dev SDK (dynamic import in refreshPodcastFeed)
const mockBatchTrigger = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({
  tasks: {
    batchTrigger: (...args: unknown[]) => mockBatchTrigger(...args),
  },
}));

describe("refreshPodcastFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockBatchTrigger.mockResolvedValue({ id: "batch_default" });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires authentication", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { refreshPodcastFeed } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await refreshPodcastFeed(1);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });

  it("requires active subscription", async () => {
    mockFindFirstPodcast.mockResolvedValue({
      id: 1,
      podcastIndexId: "12345",
      title: "Test Podcast",
      source: "podcastindex",
    });

    // No subscription found
    mockFindFirstSubscription.mockResolvedValue(null);

    const { refreshPodcastFeed } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await refreshPodcastFeed(1);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/subscribed/i);
  });

  it("triggers summarization for new episodes (happy path)", async () => {
    mockFindFirstPodcast.mockResolvedValue({
      id: 1,
      podcastIndexId: "12345",
      title: "Test Podcast",
      source: "podcastindex",
    });

    // User is subscribed
    mockFindFirstSubscription.mockResolvedValue({ id: 1 });

    // API returns 3 episodes
    mockGetEpisodesByFeedId.mockResolvedValue({
      status: "true",
      items: [
        { id: 5001, title: "Episode A" },
        { id: 5002, title: "Episode B" },
        { id: 5003, title: "Episode C" },
      ],
      count: 3,
    });

    // Episode 5002 already exists in DB
    mockSelectWhere.mockResolvedValue([{ podcastIndexId: "5002" }]);

    const { refreshPodcastFeed } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await refreshPodcastFeed(1);

    expect(result.success).toBe(true);
    expect(result.newEpisodes).toBe(2);

    // Verify batchTrigger was called with the 2 new episode IDs
    expect(mockBatchTrigger).toHaveBeenCalledWith(
      "summarize-episode",
      [
        { payload: { episodeId: 5001 } },
        { payload: { episodeId: 5003 } },
      ]
    );
  });
});
