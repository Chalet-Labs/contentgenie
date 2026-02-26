import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    query: {
      pushSubscriptions: { findMany: (...args: unknown[]) => mockFindMany(...args) },
      users: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  notifications: { userId: "userId" },
  pushSubscriptions: { userId: "userId", endpoint: "endpoint" },
  users: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

describe("notifications library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");

    // Reset module cache to reset vapidConfigured flag
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("sendPushToUser", () => {
    it("sends push to all user subscriptions", async () => {
      mockFindMany.mockResolvedValue([
        { endpoint: "https://push.example.com/1", p256dh: "key1", auth: "auth1" },
        { endpoint: "https://push.example.com/2", p256dh: "key2", auth: "auth2" },
      ]);
      mockSendNotification.mockResolvedValue({});

      const { sendPushToUser } = await import("@/lib/notifications");
      await sendPushToUser("user-1", { title: "Test", body: "Body" });

      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });

    it("deletes stale subscriptions on 404 response", async () => {
      mockFindMany.mockResolvedValue([
        { endpoint: "https://push.example.com/stale", p256dh: "key", auth: "auth" },
      ]);
      mockSendNotification.mockRejectedValue({ statusCode: 404 });
      mockDelete.mockReturnValue({ where: vi.fn() });

      const { sendPushToUser } = await import("@/lib/notifications");
      await sendPushToUser("user-1", { title: "Test", body: "Body" });

      expect(mockDelete).toHaveBeenCalled();
    });

    it("deletes stale subscriptions on 410 response", async () => {
      mockFindMany.mockResolvedValue([
        { endpoint: "https://push.example.com/gone", p256dh: "key", auth: "auth" },
      ]);
      mockSendNotification.mockRejectedValue({ statusCode: 410 });
      mockDelete.mockReturnValue({ where: vi.fn() });

      const { sendPushToUser } = await import("@/lib/notifications");
      await sendPushToUser("user-1", { title: "Test", body: "Body" });

      expect(mockDelete).toHaveBeenCalled();
    });

    it("logs error but does not throw on push failure", async () => {
      mockFindMany.mockResolvedValue([
        { endpoint: "https://push.example.com/fail", p256dh: "key", auth: "auth" },
      ]);
      mockSendNotification.mockRejectedValue(new Error("Network error"));

      const { sendPushToUser } = await import("@/lib/notifications");

      // Should not throw
      await expect(
        sendPushToUser("user-1", { title: "Test", body: "Body" })
      ).resolves.toBeUndefined();
    });
  });

  describe("createNotification", () => {
    it("inserts notification and dispatches push for realtime users", async () => {
      mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      mockFindFirst.mockResolvedValue({ preferences: { digestFrequency: "realtime" } });
      mockFindMany.mockResolvedValue([]);

      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        type: "new_episode",
        userId: "user-1",
        episodeId: 42,
        title: "Test Podcast",
        body: "New episode: Test",
      });

      expect(mockInsert).toHaveBeenCalled();
    });

    it("skips push for users with daily digest preference", async () => {
      mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      mockFindFirst.mockResolvedValue({ preferences: { digestFrequency: "daily" } });

      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        type: "summary_completed",
        userId: "user-2",
        episodeId: 10,
        title: "Podcast",
        body: "Summary ready",
      });

      expect(mockInsert).toHaveBeenCalled();
      // sendPushToUser should NOT have been called (no findMany for push subs)
      expect(mockFindMany).not.toHaveBeenCalled();
    });
  });

  describe("createBulkNotifications", () => {
    it("inserts all notifications in a single batch", async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });
      mockFindFirst.mockResolvedValue({ preferences: {} }); // defaults to realtime
      mockFindMany.mockResolvedValue([]);

      const { createBulkNotifications } = await import("@/lib/notifications");
      await createBulkNotifications([
        { type: "new_episode", userId: "user-1", episodeId: 1, title: "P1", body: "New" },
        { type: "new_episode", userId: "user-2", episodeId: 1, title: "P1", body: "New" },
      ]);

      expect(mockValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: "user-1" }),
          expect.objectContaining({ userId: "user-2" }),
        ])
      );
    });

    it("does nothing for empty items array", async () => {
      const { createBulkNotifications } = await import("@/lib/notifications");
      await createBulkNotifications([]);

      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
