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

// Mock DB — separate mocks per query type to avoid order-dependent fragility
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockPushSubsFindMany = vi.fn();
const mockUserSubsFindMany = vi.fn();
const mockUsersFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    query: {
      pushSubscriptions: {
        findMany: (...args: unknown[]) => mockPushSubsFindMany(...args),
      },
      userSubscriptions: {
        findMany: (...args: unknown[]) => mockUserSubsFindMany(...args),
      },
      users: {
        findMany: (...args: unknown[]) => mockUsersFindMany(...args),
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
  inArray: vi.fn((...args: unknown[]) => args),
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
      // push subs for realtime user only
      mockPushSubsFindMany.mockResolvedValueOnce([
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

  describe("sendPushToUser", () => {
    it("sends push notification to all user subscriptions and returns count", async () => {
      mockPushSubsFindMany.mockResolvedValue([
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
      const sent = await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
      });

      expect(mockSendNotification).toHaveBeenCalledTimes(2);
      expect(sent).toBe(2);
    });

    it("deletes stale subscriptions on 404 response", async () => {
      mockPushSubsFindMany.mockResolvedValue([
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
      mockPushSubsFindMany.mockResolvedValue([
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

    it("does not throw on push send failure and returns zero sent", async () => {
      mockPushSubsFindMany.mockResolvedValue([
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
      const sent = await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
      });
      expect(sent).toBe(0);
    });

    it("returns zero when user has no push subscriptions", async () => {
      mockPushSubsFindMany.mockResolvedValue([]);

      const { sendPushToUser } = await import(
        "@/trigger/helpers/notifications"
      );
      const sent = await sendPushToUser("user-no-subs", {
        title: "Test",
        body: "Body",
      });

      expect(sent).toBe(0);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("returns zero when VAPID keys are not configured", async () => {
      // Explicitly stub to empty strings rather than calling vi.unstubAllEnvs(),
      // which restores the original process.env values (Doppler injects real VAPID
      // keys locally, causing the function to proceed past the VAPID check).
      vi.stubEnv("VAPID_PRIVATE_KEY", "");
      vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
      vi.stubEnv("VAPID_SUBJECT", "");
      vi.resetModules();

      const { sendPushToUser } = await import(
        "@/trigger/helpers/notifications"
      );
      const sent = await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
      });

      expect(sent).toBe(0);
      expect(mockPushSubsFindMany).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });
});
