import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock sendPushToUser from the shared push module
const mockSendPushToUser = vi.fn();
vi.mock("@/lib/push", () => ({
  sendPushToUser: (...args: unknown[]) => mockSendPushToUser(...args),
  consolePushLogger: {
    warn: () => {},
    error: () => {},
  },
}));

const mockInsert = vi.fn();
const mockFindFirst = vi.fn();
const mockUsersFindMany = vi.fn();
const mockEpisodesFindFirst = vi.fn();
const mockEpisodesFindMany = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    query: {
      users: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
        findMany: (...args: unknown[]) => mockUsersFindMany(...args),
      },
      episodes: {
        findFirst: (...args: unknown[]) => mockEpisodesFindFirst(...args),
        findMany: (...args: unknown[]) => mockEpisodesFindMany(...args),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  notifications: { userId: "userId" },
  users: { id: "id" },
  episodes: { id: "id", podcastIndexId: "podcastIndexId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
}));

describe("notifications library", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSendPushToUser.mockResolvedValue({ sent: 1, failed: 0 });
    mockEpisodesFindFirst.mockResolvedValue(null);
    mockEpisodesFindMany.mockResolvedValue([]);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("createNotification", () => {
    it("inserts notification and dispatches push for realtime users", async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      mockFindFirst.mockResolvedValue({
        preferences: { digestFrequency: "realtime", pushEnabled: true },
      });

      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        type: "new_episode",
        userId: "user-1",
        episodeId: 42,
        title: "Test Podcast",
        body: "New episode: Test",
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(mockSendPushToUser).toHaveBeenCalledTimes(1);
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          title: "Test Podcast",
          body: "New episode: Test",
        }),
        expect.any(Object),
      );
    });

    it("push URL contains PodcastIndex episode ID", async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      mockFindFirst.mockResolvedValue({
        preferences: { digestFrequency: "realtime", pushEnabled: true },
      });
      mockEpisodesFindFirst.mockResolvedValue({ podcastIndexId: "PI-42" });

      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        type: "new_episode",
        userId: "user-1",
        episodeId: 42,
        title: "Test Podcast",
        body: "New episode: Test",
      });

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          data: expect.objectContaining({ url: "/episode/PI-42" }),
        }),
        expect.any(Object),
      );
    });

    it("push URL falls back to /dashboard when episode lookup fails", async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      mockFindFirst.mockResolvedValue({
        preferences: { digestFrequency: "realtime", pushEnabled: true },
      });
      mockEpisodesFindFirst.mockResolvedValue(null);

      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        type: "new_episode",
        userId: "user-1",
        episodeId: 42,
        title: "Test Podcast",
        body: "New episode: Test",
      });

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          data: expect.objectContaining({ url: "/dashboard" }),
        }),
        expect.any(Object),
      );
    });

    it("skips push for users with daily digest preference", async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      mockFindFirst.mockResolvedValue({
        preferences: { digestFrequency: "daily" },
      });

      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        type: "summary_completed",
        userId: "user-2",
        episodeId: 10,
        title: "Podcast",
        body: "Summary ready",
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });
  });

  describe("createBulkNotifications", () => {
    it("inserts all notifications in a single batch", async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });
      mockUsersFindMany.mockResolvedValue([
        {
          id: "user-1",
          preferences: { pushEnabled: true, digestFrequency: "realtime" },
        },
        {
          id: "user-2",
          preferences: { pushEnabled: true, digestFrequency: "realtime" },
        },
      ]);

      const { createBulkNotifications } = await import("@/lib/notifications");
      await createBulkNotifications([
        {
          type: "new_episode",
          userId: "user-1",
          episodeId: 1,
          title: "P1",
          body: "New",
        },
        {
          type: "new_episode",
          userId: "user-2",
          episodeId: 1,
          title: "P1",
          body: "New",
        },
      ]);

      expect(mockValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: "user-1" }),
          expect.objectContaining({ userId: "user-2" }),
        ]),
      );
    });

    it("dispatches push to realtime users only", async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });
      mockUsersFindMany.mockResolvedValue([
        {
          id: "user-1",
          preferences: { pushEnabled: true, digestFrequency: "realtime" },
        },
        {
          id: "user-2",
          preferences: { pushEnabled: true, digestFrequency: "daily" },
        },
      ]);

      const { createBulkNotifications } = await import("@/lib/notifications");
      await createBulkNotifications([
        {
          type: "new_episode",
          userId: "user-1",
          episodeId: 1,
          title: "P1",
          body: "New",
        },
        {
          type: "new_episode",
          userId: "user-2",
          episodeId: 1,
          title: "P1",
          body: "New",
        },
      ]);

      expect(mockSendPushToUser).toHaveBeenCalledTimes(1);
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-1",
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("push URL contains PodcastIndex episode ID", async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });
      mockUsersFindMany.mockResolvedValue([
        {
          id: "user-1",
          preferences: { pushEnabled: true, digestFrequency: "realtime" },
        },
      ]);
      mockEpisodesFindMany.mockResolvedValue([
        { id: 42, podcastIndexId: "PI-42" },
      ]);

      const { createBulkNotifications } = await import("@/lib/notifications");
      await createBulkNotifications([
        {
          type: "new_episode",
          userId: "user-1",
          episodeId: 42,
          title: "P1",
          body: "New",
        },
      ]);

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          data: expect.objectContaining({ url: "/episode/PI-42" }),
        }),
        expect.any(Object),
      );
    });

    it("push URL falls back to /dashboard when episode lookup fails", async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });
      mockUsersFindMany.mockResolvedValue([
        {
          id: "user-1",
          preferences: { pushEnabled: true, digestFrequency: "realtime" },
        },
      ]);
      mockEpisodesFindMany.mockResolvedValue([]);

      const { createBulkNotifications } = await import("@/lib/notifications");
      await createBulkNotifications([
        {
          type: "new_episode",
          userId: "user-1",
          episodeId: 42,
          title: "P1",
          body: "New",
        },
      ]);

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          data: expect.objectContaining({ url: "/dashboard" }),
        }),
        expect.any(Object),
      );
    });

    it("does nothing for empty items array", async () => {
      const { createBulkNotifications } = await import("@/lib/notifications");
      await createBulkNotifications([]);

      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
