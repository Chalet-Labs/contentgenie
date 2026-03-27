import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK
vi.mock("@trigger.dev/sdk", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock sendPushToUser from the shared push module
const mockSendPushToUser = vi.fn();
vi.mock("@/lib/push", () => ({
  sendPushToUser: (...args: unknown[]) => mockSendPushToUser(...args),
}));

// Mock DB — separate mocks per query type to avoid order-dependent fragility
const mockInsert = vi.fn();
const mockUserSubsFindMany = vi.fn();
const mockUsersFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockEpisodesFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    query: {
      userSubscriptions: {
        findMany: (...args: unknown[]) => mockUserSubsFindMany(...args),
      },
      users: {
        findMany: (...args: unknown[]) => mockUsersFindMany(...args),
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
      episodes: {
        findFirst: (...args: unknown[]) => mockEpisodesFindFirst(...args),
      },
      podcasts: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  notifications: { userId: "userId" },
  pushSubscriptions: { userId: "userId", endpoint: "endpoint" },
  userSubscriptions: {
    podcastId: "podcastId",
    notificationsEnabled: "notificationsEnabled",
  },
  users: { id: "id" },
  episodes: { id: "id", podcastIndexId: "podcastIndexId" },
  podcasts: { podcastIndexId: "podcastIndexId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
}));

describe("trigger/helpers/notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSendPushToUser.mockResolvedValue({ sent: 1, failed: 0 });
    mockEpisodesFindFirst.mockResolvedValue(null);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("resolvePodcastId", () => {
    it("returns internal podcast ID for a valid PodcastIndex ID", async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 42 });

      const { resolvePodcastId } = await import(
        "@/trigger/helpers/notifications"
      );
      const result = await resolvePodcastId("12345");

      expect(result).toBe(42);
    });

    it("returns null when podcast is not found", async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      const { resolvePodcastId } = await import(
        "@/trigger/helpers/notifications"
      );
      const result = await resolvePodcastId("nonexistent");

      expect(result).toBeNull();
    });

    it("accepts numeric PodcastIndex ID and converts to string", async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 7 });

      const { resolvePodcastId } = await import(
        "@/trigger/helpers/notifications"
      );
      const result = await resolvePodcastId(99999);

      expect(result).toBe(7);
    });
  });

  describe("createNotificationsForSubscribers", () => {
    it("creates notifications for all subscribed users", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-1" },
        { userId: "user-2" },
      ]);
      // Bulk user preferences query (pushEnabled defaults to false — no push dispatched)
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
        { id: "user-2", preferences: {} },
      ]);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });

      const { createNotificationsForSubscribers } = await import(
        "@/trigger/helpers/notifications"
      );
      await createNotificationsForSubscribers(
        1,
        100,
        "new_episode",
        "Test Podcast",
        "New episode: Test Episode"
      );

      expect(mockValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: "user-1" }),
          expect.objectContaining({ userId: "user-2" }),
        ])
      );
    });

    it("does nothing when no subscribers have notifications enabled", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([]);

      const { createNotificationsForSubscribers } = await import(
        "@/trigger/helpers/notifications"
      );
      await createNotificationsForSubscribers(
        1,
        100,
        "new_episode",
        "Test Podcast",
        "New episode: Test"
      );

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("only dispatches push for realtime users, skips daily/weekly", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-realtime" },
        { userId: "user-daily" },
      ]);
      // Bulk user preferences query
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
        {
          id: "user-daily",
          preferences: { digestFrequency: "daily", pushEnabled: true },
        },
      ]);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });

      const { createNotificationsForSubscribers } = await import(
        "@/trigger/helpers/notifications"
      );
      await createNotificationsForSubscribers(
        1,
        100,
        "summary_completed",
        "Test Podcast",
        "Summary ready: Episode"
      );

      // Bulk insert was called
      expect(mockInsert).toHaveBeenCalled();
      // Push was sent only once (for realtime user)
      expect(mockSendPushToUser).toHaveBeenCalledTimes(1);
    });

    it("passes logger as third arg to sendPushToUser", async () => {
      const { logger } = await import("@trigger.dev/sdk");

      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });

      const { createNotificationsForSubscribers } = await import(
        "@/trigger/helpers/notifications"
      );
      await createNotificationsForSubscribers(
        1,
        100,
        "new_episode",
        "Test Podcast",
        "New episode"
      );

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.any(Object),
        logger
      );
    });

    it("push URL contains PodcastIndex episode ID, not DB PK", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);
      mockEpisodesFindFirst.mockResolvedValueOnce({ podcastIndexId: "PI-100" });

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });

      const { createNotificationsForSubscribers } = await import(
        "@/trigger/helpers/notifications"
      );
      await createNotificationsForSubscribers(
        1,
        100,
        "new_episode",
        "Test Podcast",
        "New episode: Test Episode"
      );

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({
          data: expect.objectContaining({ url: "/episode/PI-100" }),
        }),
        expect.anything()
      );
    });

    it("push URL falls back to /dashboard when episode lookup returns null", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);
      mockEpisodesFindFirst.mockResolvedValueOnce(null);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });

      const { createNotificationsForSubscribers } = await import(
        "@/trigger/helpers/notifications"
      );
      await createNotificationsForSubscribers(
        1,
        100,
        "new_episode",
        "Test Podcast",
        "New episode: Test Episode"
      );

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({
          data: expect.objectContaining({ url: "/dashboard" }),
        }),
        expect.anything()
      );
    });

    it("skips DB lookup when podcastIndexEpisodeId is provided", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });

      const { createNotificationsForSubscribers } = await import(
        "@/trigger/helpers/notifications"
      );
      await createNotificationsForSubscribers(
        1,
        100,
        "new_episode",
        "Test Podcast",
        "New episode: Test Episode",
        { podcastIndexEpisodeId: "PI-100" }
      );

      expect(mockEpisodesFindFirst).not.toHaveBeenCalled();
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({
          data: expect.objectContaining({ url: "/episode/PI-100" }),
        }),
        expect.anything()
      );
    });

    it("handles null episodeId correctly", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      // Bulk user preferences query (pushEnabled defaults to false — no push dispatched)
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
      ]);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });

      const { createNotificationsForSubscribers } = await import(
        "@/trigger/helpers/notifications"
      );
      await createNotificationsForSubscribers(
        1,
        null,
        "new_episode",
        "Podcast",
        "New episode"
      );

      expect(mockValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ episodeId: null }),
        ])
      );
    });
  });
});
