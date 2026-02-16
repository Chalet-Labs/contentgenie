import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK before imports
const mockMetadataSet = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((config) => config),
  retry: {
    onThrow: vi.fn(async (fn) => fn()),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  metadata: {
    set: (...args: unknown[]) => mockMetadataSet(...args),
  },
}));

// Mock database
const mockInsertValues = vi.fn();
const mockInsertOnConflict = vi.fn();
const mockInsertReturning = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: (...args: unknown[]) => {
        mockInsertValues(...args);
        return {
          onConflictDoNothing: (...cArgs: unknown[]) => {
            mockInsertOnConflict(...cArgs);
            return {
              returning: (...rArgs: unknown[]) => mockInsertReturning(...rArgs),
            };
          },
          onConflictDoUpdate: (...cArgs: unknown[]) => {
            mockInsertOnConflict(...cArgs);
            return {
              returning: (...rArgs: unknown[]) => mockInsertReturning(...rArgs),
            };
          },
        };
      },
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id" },
  podcasts: { id: "id", podcastIndexId: "podcast_index_id" },
  episodes: { podcastIndexId: "podcast_index_id" },
  userSubscriptions: { userId: "user_id", podcastId: "podcast_id" },
}));

// Mock PodcastIndex helper
const mockGetPodcastByFeedUrl = vi.fn();
vi.mock("@/trigger/helpers/podcastindex", () => ({
  getPodcastByFeedUrl: (...args: unknown[]) => mockGetPodcastByFeedUrl(...args),
}));

// Mock RSS parser
const mockParsePodcastFeed = vi.fn();
const mockGeneratePodcastSyntheticId = vi.fn();
const mockGenerateEpisodeSyntheticId = vi.fn();
vi.mock("@/lib/rss", () => ({
  parsePodcastFeed: (...args: unknown[]) => mockParsePodcastFeed(...args),
  generatePodcastSyntheticId: (...args: unknown[]) => mockGeneratePodcastSyntheticId(...args),
  generateEpisodeSyntheticId: (...args: unknown[]) => mockGenerateEpisodeSyntheticId(...args),
}));

import { importOpml } from "@/trigger/import-opml";
import type { ImportOpmlPayload, ImportOpmlResult } from "@/trigger/import-opml";

// task mock returns the raw config, so `.run` is available
const taskRunner = importOpml as unknown as {
  run: (payload: ImportOpmlPayload) => Promise<ImportOpmlResult>;
};

describe("import-opml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: inserts succeed with a new podcast ID
    mockInsertReturning.mockResolvedValue([{ id: 1 }]);
    mockInsertOnConflict.mockReturnValue({
      returning: (...rArgs: unknown[]) => mockInsertReturning(...rArgs),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports feeds found on PodcastIndex", async () => {
    mockGetPodcastByFeedUrl.mockResolvedValue({
      feed: {
        id: 12345,
        title: "Tech Podcast",
        description: "A tech podcast",
        author: "Author",
        artwork: "https://img.com/art.jpg",
        image: "",
        url: "https://feeds.example.com/tech",
        originalUrl: "https://feeds.example.com/tech",
        categories: { "1": "Technology" },
        episodeCount: 100,
      },
    });

    const result = await taskRunner.run({
      userId: "user_123",
      userEmail: "test@example.com",
      feeds: [{ feedUrl: "https://feeds.example.com/tech", title: "Tech Podcast" }],
      alreadySubscribedCount: 2,
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(2);
    expect(mockGetPodcastByFeedUrl).toHaveBeenCalledWith("https://feeds.example.com/tech");
  });

  it("falls back to RSS parsing when PodcastIndex lookup fails", async () => {
    mockGetPodcastByFeedUrl.mockRejectedValue(new Error("Not found"));
    mockGeneratePodcastSyntheticId.mockReturnValue("rss-abc123");
    mockGenerateEpisodeSyntheticId.mockReturnValue("rss-ep-def456");

    mockParsePodcastFeed.mockResolvedValue({
      title: "RSS Podcast",
      description: "A podcast",
      author: "RSS Author",
      imageUrl: null,
      link: null,
      feedUrl: "https://example.com/rss",
      episodes: [
        {
          title: "Episode 1",
          description: "Desc",
          audioUrl: "https://example.com/ep1.mp3",
          guid: "guid-1",
          publishDate: new Date("2024-01-01"),
          duration: 3600,
        },
      ],
    });

    const result = await taskRunner.run({
      userId: "user_123",
      userEmail: "test@example.com",
      feeds: [{ feedUrl: "https://example.com/rss" }],
      alreadySubscribedCount: 0,
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockParsePodcastFeed).toHaveBeenCalledWith("https://example.com/rss");
  });

  it("isolates per-feed errors and continues processing", async () => {
    // First feed fails entirely (both PI and RSS)
    mockGetPodcastByFeedUrl
      .mockRejectedValueOnce(new Error("Not found"))
      .mockResolvedValueOnce({
        feed: { id: 999, title: "Good Podcast", description: "", author: "", artwork: "", image: "", url: "https://good.com/feed", originalUrl: "", categories: {}, episodeCount: 10 },
      });
    mockParsePodcastFeed.mockRejectedValueOnce(new Error("Invalid RSS"));

    const result = await taskRunner.run({
      userId: "user_123",
      userEmail: "test@example.com",
      feeds: [
        { feedUrl: "https://bad.com/feed", title: "Bad Feed" },
        { feedUrl: "https://good.com/feed", title: "Good Feed" },
      ],
      alreadySubscribedCount: 0,
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("updates progress metadata after each feed", async () => {
    mockGetPodcastByFeedUrl.mockResolvedValue({
      feed: { id: 100, title: "Pod", description: "", author: "", artwork: "", image: "", url: "https://a.com/feed", originalUrl: "", categories: {}, episodeCount: 5 },
    });

    await taskRunner.run({
      userId: "user_123",
      userEmail: "test@example.com",
      feeds: [
        { feedUrl: "https://a.com/feed" },
        { feedUrl: "https://b.com/feed" },
      ],
      alreadySubscribedCount: 3,
    });

    // Initial progress + 2 per-feed updates = 3 calls
    const progressCalls = mockMetadataSet.mock.calls.filter(
      (call: unknown[]) => call[0] === "progress"
    );
    expect(progressCalls).toHaveLength(3);

    // Final progress should show completed = total
    const finalProgress = progressCalls[2][1];
    expect(finalProgress.total).toBe(5); // 2 feeds + 3 already subscribed
    expect(finalProgress.succeeded).toBe(2);
    expect(finalProgress.completed).toBe(5);
    expect(finalProgress.skipped).toBe(3);
  });

  it("returns early with correct counts when no feeds to process", async () => {
    const result = await taskRunner.run({
      userId: "user_123",
      userEmail: "test@example.com",
      feeds: [],
      alreadySubscribedCount: 10,
    });

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(10);
    expect(mockGetPodcastByFeedUrl).not.toHaveBeenCalled();
  });

  it("logs failed feed URLs at error level", async () => {
    mockGetPodcastByFeedUrl.mockRejectedValue(new Error("PI fail"));
    mockParsePodcastFeed.mockRejectedValue(new Error("RSS fail"));

    await taskRunner.run({
      userId: "user_123",
      userEmail: "test@example.com",
      feeds: [{ feedUrl: "https://broken.com/feed", title: "Broken" }],
      alreadySubscribedCount: 0,
    });

    const { logger } = await import("@trigger.dev/sdk");
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "Failed to import feed",
      expect.objectContaining({ feedUrl: "https://broken.com/feed" })
    );
  });
});
