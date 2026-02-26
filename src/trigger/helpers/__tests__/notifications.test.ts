import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK
vi.mock("@trigger.dev/sdk", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock web-push
const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

// Mock DB
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    query: {
      pushSubscriptions: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
      userSubscriptions: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
      users: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
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
  podcasts: { podcastIndexId: "podcastIndexId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

describe("trigger/helpers/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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
      // findMany for userSubscriptions
      mockFindMany.mockResolvedValueOnce([
        { userId: "user-1" },
        { userId: "user-2" },
      ]);
      // findFirst for each user's preferences (realtime)
      mockFindFirst
        .mockResolvedValueOnce({ id: "user-1", preferences: {} })
        .mockResolvedValueOnce({ id: "user-2", preferences: {} });
      // findMany for push subscriptions per user (empty — no push subs)
      mockFindMany
        .mockResolvedValueOnce([]) // user-1 push subs
        .mockResolvedValueOnce([]); // user-2 push subs

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
      mockFindMany.mockResolvedValueOnce([]);

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
      mockFindMany.mockResolvedValueOnce([
        { userId: "user-realtime" },
        { userId: "user-daily" },
      ]);
      mockFindFirst
        .mockResolvedValueOnce({
          id: "user-realtime",
          preferences: { digestFrequency: "realtime" },
        })
        .mockResolvedValueOnce({
          id: "user-daily",
          preferences: { digestFrequency: "daily" },
        });
      // push subs for realtime user only
      mockFindMany.mockResolvedValueOnce([
        {
          endpoint: "https://push.example.com/1",
          p256dh: "key",
          auth: "auth",
        },
      ]);

      mockSendNotification.mockResolvedValue({});
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
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    it("handles null episodeId correctly", async () => {
      mockFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockFindFirst.mockResolvedValueOnce({ id: "user-1", preferences: {} });
      mockFindMany.mockResolvedValueOnce([]); // no push subs

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

  describe("sendPushToUser", () => {
    it("sends push notification to all user subscriptions", async () => {
      mockFindMany.mockResolvedValue([
        {
          endpoint: "https://push.example.com/1",
          p256dh: "key1",
          auth: "auth1",
        },
        {
          endpoint: "https://push.example.com/2",
          p256dh: "key2",
          auth: "auth2",
        },
      ]);
      mockSendNotification.mockResolvedValue({});

      const { sendPushToUser } = await import(
        "@/trigger/helpers/notifications"
      );
      await sendPushToUser("user-1", { title: "Test", body: "Body" });

      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });

    it("deletes stale subscriptions on 404 response", async () => {
      mockFindMany.mockResolvedValue([
        {
          endpoint: "https://push.example.com/stale",
          p256dh: "key",
          auth: "auth",
        },
      ]);
      mockSendNotification.mockRejectedValue({ statusCode: 404 });
      mockDelete.mockReturnValue({ where: vi.fn() });

      const { sendPushToUser } = await import(
        "@/trigger/helpers/notifications"
      );
      await sendPushToUser("user-1", { title: "Test", body: "Body" });

      expect(mockDelete).toHaveBeenCalled();
    });

    it("deletes stale subscriptions on 410 response", async () => {
      mockFindMany.mockResolvedValue([
        {
          endpoint: "https://push.example.com/gone",
          p256dh: "key",
          auth: "auth",
        },
      ]);
      mockSendNotification.mockRejectedValue({ statusCode: 410 });
      mockDelete.mockReturnValue({ where: vi.fn() });

      const { sendPushToUser } = await import(
        "@/trigger/helpers/notifications"
      );
      await sendPushToUser("user-1", { title: "Test", body: "Body" });

      expect(mockDelete).toHaveBeenCalled();
    });

    it("does not throw on push send failure", async () => {
      mockFindMany.mockResolvedValue([
        {
          endpoint: "https://push.example.com/fail",
          p256dh: "key",
          auth: "auth",
        },
      ]);
      mockSendNotification.mockRejectedValue(new Error("Network error"));

      const { sendPushToUser } = await import(
        "@/trigger/helpers/notifications"
      );
      await expect(
        sendPushToUser("user-1", { title: "Test", body: "Body" })
      ).resolves.toBeUndefined();
    });

    it("returns early when user has no push subscriptions", async () => {
      mockFindMany.mockResolvedValue([]);

      const { sendPushToUser } = await import(
        "@/trigger/helpers/notifications"
      );
      await sendPushToUser("user-no-subs", { title: "Test", body: "Body" });

      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("returns early when VAPID keys are not configured", async () => {
      vi.unstubAllEnvs();
      // No VAPID env vars set

      const { sendPushToUser } = await import(
        "@/trigger/helpers/notifications"
      );
      await sendPushToUser("user-1", { title: "Test", body: "Body" });

      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });
});
