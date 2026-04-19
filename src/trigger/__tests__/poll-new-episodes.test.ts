import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK before imports
const mockBatchTrigger = vi.fn();

vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: vi.fn((config) => config),
  },
  retry: {
    onThrow: vi.fn(async (fn) => fn()),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/trigger/fetch-transcript", () => ({
  fetchTranscriptTask: {
    batchTrigger: (...args: unknown[]) => mockBatchTrigger(...args),
  },
}));

// Mock database
const mockSelect = vi.fn();
const mockSelectDistinct = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockInsertValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();
const mockInsertReturning = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return { from: (...fArgs: unknown[]) => { mockFrom(...fArgs); return { where: (...wArgs: unknown[]) => mockWhere(...wArgs) }; } };
    },
    selectDistinct: (...args: unknown[]) => {
      mockSelectDistinct(...args);
      return { from: (...fArgs: unknown[]) => { mockFrom(...fArgs); return fArgs; } };
    },
    update: vi.fn().mockReturnValue({
      set: (...args: unknown[]) => {
        mockUpdateSet(...args);
        return { where: (...wArgs: unknown[]) => mockUpdateWhere(...wArgs) };
      },
    }),
    insert: vi.fn().mockReturnValue({
      values: (...args: unknown[]) => {
        mockInsertValues(...args);
        return {
          onConflictDoUpdate: (...cdArgs: unknown[]) => {
            mockOnConflictDoUpdate(...cdArgs);
            return { returning: (...rArgs: unknown[]) => mockInsertReturning(...rArgs) };
          },
        };
      },
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  podcasts: { id: "id", podcastIndexId: "podcast_index_id", source: "source" },
  episodes: { podcastIndexId: "podcast_index_id" },
  userSubscriptions: { podcastId: "podcast_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((...args: unknown[]) => args),
  }),
}));

// Mock PodcastIndex helper
const mockGetEpisodesByFeedId = vi.fn();
vi.mock("@/trigger/helpers/podcastindex", () => ({
  getEpisodesByFeedId: (...args: unknown[]) => mockGetEpisodesByFeedId(...args),
}));

// Mock notifications helper
const mockCreateEpisodeNotifications = vi.fn();
vi.mock("@/trigger/helpers/notifications", () => ({
  createEpisodeNotifications: (...args: unknown[]) => mockCreateEpisodeNotifications(...args),
}));

import { getSubscribedPodcasts, pollSingleFeed, pollNewEpisodes } from "@/trigger/poll-new-episodes";
import { podcasts } from "@/db/schema";

// schedules.task mock returns the raw config, so `.run` is available
const taskRunner = pollNewEpisodes as unknown as {
  run: (payload: { timestamp: Date }) => Promise<{
    feedsPolled: number;
    newEpisodesFound: number;
    transcriptFetchesTriggered: number;
    feedErrors: number;
  }>;
};

const makePodcast = (overrides?: Partial<typeof podcasts.$inferSelect>): typeof podcasts.$inferSelect => ({
  id: 1,
  podcastIndexId: "12345",
  title: "Test Podcast",
  description: "A test podcast",
  publisher: "Test Publisher",
  imageUrl: "https://example.com/image.jpg",
  rssFeedUrl: "https://example.com/feed.xml",
  categories: null,
  totalEpisodes: 10,
  latestEpisodeDate: null,
  source: "podcastindex",
  lastPolledAt: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
});

describe("poll-new-episodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchTrigger.mockResolvedValue({ id: "batch_default" });
    mockUpdateWhere.mockResolvedValue(undefined);
    mockInsertReturning.mockResolvedValue([]);
    mockCreateEpisodeNotifications.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getSubscribedPodcasts", () => {
    it("returns correct podcasts with subscribers", async () => {
      const podcastA = makePodcast({ id: 1, podcastIndexId: "111", title: "Podcast A" });
      const podcastB = makePodcast({ id: 2, podcastIndexId: "222", title: "Podcast B" });

      mockWhere.mockResolvedValue([podcastA, podcastB]);

      const result = await getSubscribedPodcasts();

      expect(result).toEqual([podcastA, podcastB]);
      expect(result).toHaveLength(2);
    });

    it("excludes RSS-sourced podcasts from query", async () => {
      const piPodcast = makePodcast({ id: 1, podcastIndexId: "111", source: "podcastindex" });
      const rssPodcast = makePodcast({ id: 2, podcastIndexId: "rss-abc123", source: "rss" });

      mockWhere.mockResolvedValue([piPodcast, rssPodcast]);

      const result = await getSubscribedPodcasts();

      expect(result).toEqual([piPodcast]);
      expect(result).not.toContainEqual(expect.objectContaining({ source: "rss" }));

      // Verify RSS podcasts are logged
      const { logger } = await import("@trigger.dev/sdk");
      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Skipped RSS-sourced podcasts (not compatible with PodcastIndex API)",
        { count: 1 }
      );
    });
  });

  describe("pollSingleFeed", () => {
    it("detects new episodes correctly (dedup logic)", async () => {
      const podcast = makePodcast({ id: 1, podcastIndexId: "456" });

      mockGetEpisodesByFeedId.mockResolvedValue({
        status: "true",
        items: [
          { id: 1001, title: "New Episode", enclosureUrl: "https://example.com/1.mp3", description: "D1", transcripts: [] },
          { id: 1002, title: "Existing Episode", enclosureUrl: "https://example.com/2.mp3", description: "D2", transcripts: [] },
          { id: 1003, title: "Another New", enclosureUrl: "https://example.com/3.mp3", description: "D3", transcripts: [] },
        ],
        count: 3,
      });

      // Episode 1002 already exists in DB
      mockWhere.mockResolvedValue([{ podcastIndexId: "1002" }]);

      const result = await pollSingleFeed(podcast);

      expect(result.newEpisodes).toBe(2);
      expect(result.triggered).toBe(2);
    });

    it("inserts episode stubs and calls batchTrigger with correct payloads", async () => {
      const podcast = makePodcast({ id: 1, podcastIndexId: "456" });

      mockGetEpisodesByFeedId.mockResolvedValue({
        status: "true",
        items: [
          { id: 2001, title: "Episode A", enclosureUrl: "https://example.com/a.mp3", description: "Desc A", duration: 600, datePublished: 1700000000, transcripts: [] },
          { id: 2002, title: "Episode B", enclosureUrl: "https://example.com/b.mp3", description: "Desc B", duration: 1200, datePublished: 0, transcripts: [{ url: "https://example.com/b.srt", type: "application/srt" }] },
        ],
        count: 2,
      });

      // No existing episodes
      mockWhere.mockResolvedValue([]);

      await pollSingleFeed(podcast);

      // Verify episode stubs are batch-inserted with correct shape
      expect(mockInsertValues).toHaveBeenCalledWith([
        expect.objectContaining({
          podcastId: 1,
          podcastIndexId: "2001",
          title: "Episode A",
          audioUrl: "https://example.com/a.mp3",
          transcriptStatus: "fetching",
        }),
        expect.objectContaining({
          podcastId: 1,
          podcastIndexId: "2002",
          title: "Episode B",
          audioUrl: "https://example.com/b.mp3",
          transcriptStatus: "fetching",
        }),
      ]);
      expect(mockOnConflictDoUpdate).toHaveBeenCalled();

      // Verify fetch-transcript triggered with episode metadata
      expect(mockBatchTrigger).toHaveBeenCalledWith([
        {
          payload: { episodeId: 2001, enclosureUrl: "https://example.com/a.mp3", description: "Desc A", transcripts: [], triggerSummarize: true },
          options: { idempotencyKey: "poll-fetch-transcript-2001" },
        },
        {
          payload: { episodeId: 2002, enclosureUrl: "https://example.com/b.mp3", description: "Desc B", transcripts: [{ url: "https://example.com/b.srt", type: "application/srt" }], triggerSummarize: true },
          options: { idempotencyKey: "poll-fetch-transcript-2002" },
        },
      ]);
    });

    it("calls createEpisodeNotifications once with a batch of all fetched episodes", async () => {
      const podcast = makePodcast({ id: 1, podcastIndexId: "456", title: "My Podcast" });

      mockGetEpisodesByFeedId.mockResolvedValue({
        status: "true",
        items: [
          { id: 5001, title: "Episode X", enclosureUrl: "https://example.com/x.mp3", description: "Dx", duration: 600, datePublished: 1700000000, transcripts: [] },
          { id: 5002, title: "Episode Y", enclosureUrl: "https://example.com/y.mp3", description: "Dy", duration: 900, datePublished: 1700000001, transcripts: [] },
        ],
        count: 2,
      });

      // No existing episodes
      mockWhere.mockResolvedValue([]);

      // Simulate .returning() yielding all upserted rows
      mockInsertReturning.mockResolvedValue([
        { id: 10, podcastIndexId: "5001" },
        { id: 11, podcastIndexId: "5002" },
      ]);

      await pollSingleFeed(podcast);

      // Single batch call — N+1 is eliminated.
      expect(mockCreateEpisodeNotifications).toHaveBeenCalledTimes(1);
      expect(mockCreateEpisodeNotifications).toHaveBeenCalledWith(1, [
        {
          episodeId: 10,
          podcastIndexEpisodeId: "5001",
          title: "My Podcast",
          body: "New episode: Episode X",
        },
        {
          episodeId: 11,
          podcastIndexEpisodeId: "5002",
          title: "My Podcast",
          body: "New episode: Episode Y",
        },
      ]);
    });

    it("calls createEpisodeNotifications even when dedup filters out all episodes (retry safety)", async () => {
      // Retry scenario: a prior poll inserted these episodes but crashed before
      // creating notifications. The dedup query sees them as existing, so
      // newEpisodes is empty, but the upsert still returns the rows — the
      // notification batch fires and the helper's partial unique index keeps
      // it idempotent.
      const podcast = makePodcast({ id: 1, podcastIndexId: "456", title: "My Podcast" });

      mockGetEpisodesByFeedId.mockResolvedValue({
        status: "true",
        items: [
          { id: 6001, title: "Episode Z", enclosureUrl: "https://example.com/z.mp3", description: "Dz", transcripts: [] },
        ],
        count: 1,
      });

      // Episode already exists in DB (from a prior failed poll)
      mockWhere.mockResolvedValue([{ podcastIndexId: "6001" }]);

      // onConflictDoUpdate + returning yields the row anyway
      mockInsertReturning.mockResolvedValue([{ id: 99, podcastIndexId: "6001" }]);

      await pollSingleFeed(podcast);

      expect(mockCreateEpisodeNotifications).toHaveBeenCalledTimes(1);
      expect(mockCreateEpisodeNotifications).toHaveBeenCalledWith(1, [
        {
          episodeId: 99,
          podcastIndexEpisodeId: "6001",
          title: "My Podcast",
          body: "New episode: Episode Z",
        },
      ]);
      // But fetch-transcript is NOT re-triggered for already-existing episodes
      expect(mockBatchTrigger).not.toHaveBeenCalled();
    });

    it("still calls batchTrigger even when createEpisodeNotifications throws", async () => {
      const podcast = makePodcast({ id: 1, podcastIndexId: "456" });

      mockGetEpisodesByFeedId.mockResolvedValue({
        status: "true",
        items: [
          { id: 7001, title: "Episode Fail", enclosureUrl: "https://example.com/fail.mp3", description: "Dfail", transcripts: [] },
        ],
        count: 1,
      });

      mockWhere.mockResolvedValue([]);
      mockInsertReturning.mockResolvedValue([{ id: 20, podcastIndexId: "7001" }]);
      mockCreateEpisodeNotifications.mockRejectedValue(new Error("push service down"));

      // Should NOT throw — notification failure must not block batchTrigger
      await expect(pollSingleFeed(podcast)).resolves.not.toThrow();
      expect(mockBatchTrigger).toHaveBeenCalled();
    });

    it("handles API errors gracefully (error isolation)", async () => {
      const podcast = makePodcast({ id: 1, podcastIndexId: "456" });

      mockGetEpisodesByFeedId.mockRejectedValue(new Error("PodcastIndex API error"));

      // retry.onThrow is mocked to just call the fn directly, so the error propagates
      // The caller (the scheduled task run function) handles the error isolation
      await expect(pollSingleFeed(podcast)).rejects.toThrow("PodcastIndex API error");
    });

    it("updates lastPolledAt after successful poll", async () => {
      const podcast = makePodcast({ id: 1, podcastIndexId: "456" });

      mockGetEpisodesByFeedId.mockResolvedValue({
        status: "true",
        items: [{ id: 3001, title: "New Episode" }],
        count: 1,
      });
      mockWhere.mockResolvedValue([]);

      await pollSingleFeed(podcast);

      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          lastPolledAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
    });

    it("skips batchTrigger when all episodes already exist in DB", async () => {
      const podcast = makePodcast({ id: 1, podcastIndexId: "456" });

      mockGetEpisodesByFeedId.mockResolvedValue({
        status: "true",
        items: [
          { id: 4001, title: "Existing 1" },
          { id: 4002, title: "Existing 2" },
        ],
        count: 2,
      });

      // All episodes already exist
      mockWhere.mockResolvedValue([
        { podcastIndexId: "4001" },
        { podcastIndexId: "4002" },
      ]);

      const result = await pollSingleFeed(podcast);

      expect(result.newEpisodes).toBe(0);
      expect(result.triggered).toBe(0);
      expect(mockBatchTrigger).not.toHaveBeenCalled();
    });

    it("handles API returning 0 episodes (updates lastPolledAt, no batchTrigger)", async () => {
      const podcast = makePodcast({ id: 1, podcastIndexId: "456" });

      mockGetEpisodesByFeedId.mockResolvedValue({
        status: "true",
        items: [],
        count: 0,
      });

      const result = await pollSingleFeed(podcast);

      expect(result.newEpisodes).toBe(0);
      expect(result.triggered).toBe(0);
      expect(mockBatchTrigger).not.toHaveBeenCalled();

      // Should still update lastPolledAt
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          lastPolledAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
    });
  });

  describe("pollNewEpisodes.run (scheduled runner)", () => {
    it("returns zeroed summary when no subscribed podcasts exist", async () => {
      // getSubscribedPodcasts relies on mockWhere for the podcast query;
      // return empty array to simulate no subscriptions
      mockWhere.mockResolvedValue([]);

      const result = await taskRunner.run({ timestamp: new Date() });

      expect(result).toEqual({
        feedsPolled: 0,
        newEpisodesFound: 0,
        transcriptFetchesTriggered: 0,
        feedErrors: 0,
      });
    });

    it("aggregates results across multiple feeds", async () => {
      const podcastA = makePodcast({ id: 1, podcastIndexId: "111", title: "Podcast A" });
      const podcastB = makePodcast({ id: 2, podcastIndexId: "222", title: "Podcast B" });

      // First call: getSubscribedPodcasts query returns both podcasts
      // Subsequent calls: pollSingleFeed dedup queries return no existing episodes
      mockWhere
        .mockResolvedValueOnce([podcastA, podcastB]) // getSubscribedPodcasts
        .mockResolvedValueOnce([])                    // pollSingleFeed(A) dedup
        .mockResolvedValueOnce([]);                   // pollSingleFeed(B) dedup

      mockGetEpisodesByFeedId
        .mockResolvedValueOnce({ status: "true", items: [{ id: 1001, title: "Ep A1" }], count: 1 })
        .mockResolvedValueOnce({ status: "true", items: [{ id: 2001, title: "Ep B1" }, { id: 2002, title: "Ep B2" }], count: 2 });

      const result = await taskRunner.run({ timestamp: new Date() });

      expect(result.feedsPolled).toBe(2);
      expect(result.newEpisodesFound).toBe(3);
      expect(result.transcriptFetchesTriggered).toBe(3);
      expect(result.feedErrors).toBe(0);
    });

    it("isolates per-feed errors and continues polling remaining feeds", async () => {
      const podcastA = makePodcast({ id: 1, podcastIndexId: "111", title: "Failing Podcast" });
      const podcastB = makePodcast({ id: 2, podcastIndexId: "222", title: "Good Podcast" });

      mockWhere
        .mockResolvedValueOnce([podcastA, podcastB]) // getSubscribedPodcasts
        .mockResolvedValueOnce([]);                   // pollSingleFeed(B) dedup

      // First feed fails, second succeeds
      mockGetEpisodesByFeedId
        .mockRejectedValueOnce(new Error("API timeout"))
        .mockResolvedValueOnce({ status: "true", items: [{ id: 3001, title: "Ep" }], count: 1 });

      const result = await taskRunner.run({ timestamp: new Date() });

      expect(result.feedErrors).toBe(1);
      expect(result.feedsPolled).toBe(1);
      expect(result.newEpisodesFound).toBe(1);
    });
  });
});
