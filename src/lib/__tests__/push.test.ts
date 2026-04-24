import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

const mockDelete = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/db", () => ({
  db: {
    delete: (...args: unknown[]) => mockDelete(...args),
    query: {
      pushSubscriptions: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  pushSubscriptions: { userId: "userId", endpoint: "endpoint" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

describe("push module", () => {
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

  describe("TOPIC_MAX_LENGTH", () => {
    it("is 32", async () => {
      const { TOPIC_MAX_LENGTH } = await import("@/lib/push");
      expect(TOPIC_MAX_LENGTH).toBe(32);
    });
  });

  describe("sanitizeTopic", () => {
    it("truncates to TOPIC_MAX_LENGTH characters", async () => {
      const { sanitizeTopic, TOPIC_MAX_LENGTH } = await import("@/lib/push");
      const longTag = "a".repeat(TOPIC_MAX_LENGTH + 18);
      expect(sanitizeTopic(longTag)).toBe("a".repeat(TOPIC_MAX_LENGTH));
    });

    it("strips non-URL-safe-base64 characters", async () => {
      const { sanitizeTopic } = await import("@/lib/push");
      expect(sanitizeTopic("tag:with/invalid chars!")).toBe(
        "tagwithinvalidchars",
      );
    });

    it("keeps URL-safe-base64 characters (A-Z, a-z, 0-9, -, _)", async () => {
      const { sanitizeTopic } = await import("@/lib/push");
      expect(sanitizeTopic("Valid-Tag_123")).toBe("Valid-Tag_123");
    });
  });

  describe("sendPushToUser", () => {
    it("sends push to all user subscriptions and returns sent count", async () => {
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

      const { sendPushToUser } = await import("@/lib/push");
      const result = await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
      });

      expect(mockSendNotification).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ sent: 2, failed: 0 });
    });

    it("passes topic to sendNotification when tag is provided", async () => {
      mockFindMany.mockResolvedValue([
        {
          endpoint: "https://push.example.com/1",
          p256dh: "key1",
          auth: "auth1",
        },
      ]);
      mockSendNotification.mockResolvedValue({});

      const { sendPushToUser } = await import("@/lib/push");
      await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
        tag: "new_episode-42",
      });

      expect(mockSendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ topic: "new_episode-42" }),
      );
    });

    it("omits topic from sendNotification when no tag is provided", async () => {
      mockFindMany.mockResolvedValue([
        {
          endpoint: "https://push.example.com/1",
          p256dh: "key1",
          auth: "auth1",
        },
      ]);
      mockSendNotification.mockResolvedValue({});

      const { sendPushToUser } = await import("@/lib/push");
      await sendPushToUser("user-1", { title: "Test", body: "Body" });

      const options = mockSendNotification.mock.calls[0][2];
      expect(options).not.toHaveProperty("topic");
    });

    it("truncates topic to TOPIC_MAX_LENGTH characters per RFC 8030", async () => {
      mockFindMany.mockResolvedValue([
        {
          endpoint: "https://push.example.com/1",
          p256dh: "key1",
          auth: "auth1",
        },
      ]);
      mockSendNotification.mockResolvedValue({});

      const { sendPushToUser, TOPIC_MAX_LENGTH } = await import("@/lib/push");
      const longTag = "a".repeat(TOPIC_MAX_LENGTH + 18);
      await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
        tag: longTag,
      });

      expect(mockSendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ topic: "a".repeat(TOPIC_MAX_LENGTH) }),
      );
    });

    it("strips non-URL-safe-base64 characters from topic per RFC 8030", async () => {
      mockFindMany.mockResolvedValue([
        {
          endpoint: "https://push.example.com/1",
          p256dh: "key1",
          auth: "auth1",
        },
      ]);
      mockSendNotification.mockResolvedValue({});

      const { sendPushToUser } = await import("@/lib/push");
      await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
        tag: "tag:with/invalid chars!",
      });

      expect(mockSendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ topic: "tagwithinvalidchars" }),
      );
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

      const { sendPushToUser } = await import("@/lib/push");
      const result = await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toEqual({ sent: 0, failed: 1 });
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

      const { sendPushToUser } = await import("@/lib/push");
      const result = await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toEqual({ sent: 0, failed: 1 });
    });

    it("returns failed count when push fails with non-stale error", async () => {
      mockFindMany.mockResolvedValue([
        {
          endpoint: "https://push.example.com/fail",
          p256dh: "key",
          auth: "auth",
        },
      ]);
      mockSendNotification.mockRejectedValue(new Error("Network error"));

      const { sendPushToUser } = await import("@/lib/push");
      const result = await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
      });

      expect(result).toEqual({ sent: 0, failed: 1 });
    });

    it("returns { sent: 0, failed: 0 } for empty subscriptions (early return)", async () => {
      mockFindMany.mockResolvedValue([]);

      const { sendPushToUser } = await import("@/lib/push");
      const result = await sendPushToUser("user-no-subs", {
        title: "Test",
        body: "Body",
      });

      expect(result).toEqual({ sent: 0, failed: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("returns { sent: 0, failed: 0 } when VAPID keys are not configured", async () => {
      vi.stubEnv("VAPID_PRIVATE_KEY", "");
      vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
      vi.stubEnv("VAPID_SUBJECT", "");
      vi.resetModules();

      const { sendPushToUser } = await import("@/lib/push");
      const result = await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
      });

      expect(result).toEqual({ sent: 0, failed: 0 });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("uses default consolePushLogger when no logger arg is passed", async () => {
      mockFindMany.mockResolvedValue([
        {
          endpoint: "https://push.example.com/fail",
          p256dh: "key",
          auth: "auth",
        },
      ]);
      mockSendNotification.mockRejectedValue(new Error("Network error"));
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { sendPushToUser } = await import("@/lib/push");
      await expect(
        sendPushToUser("user-1", { title: "Test", body: "Body" }),
      ).resolves.toBeDefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[push]"),
        expect.any(Object),
      );
      consoleSpy.mockRestore();
    });

    it("calls custom logger.warn on VAPID misconfiguration", async () => {
      vi.stubEnv("VAPID_PRIVATE_KEY", "");
      vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
      vi.stubEnv("VAPID_SUBJECT", "");
      vi.resetModules();

      const mockLogger = { warn: vi.fn(), error: vi.fn() };

      const { sendPushToUser } = await import("@/lib/push");
      await sendPushToUser(
        "user-1",
        { title: "Test", body: "Body" },
        mockLogger,
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("VAPID"),
        expect.any(Object),
      );
    });

    it("calls custom logger.warn on push notification failure with redacted endpoint", async () => {
      const endpoint =
        "https://push.example.com/abcdefghijklmnopqrstuvwxyz123456";
      mockFindMany.mockResolvedValue([
        { endpoint, p256dh: "key", auth: "auth" },
      ]);
      mockSendNotification.mockRejectedValue(new Error("Network error"));

      const mockLogger = { warn: vi.fn(), error: vi.fn() };

      const { sendPushToUser } = await import("@/lib/push");
      await sendPushToUser(
        "user-1",
        { title: "Test", body: "Body" },
        mockLogger,
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Push notification failed",
        expect.objectContaining({
          endpoint: expect.stringContaining("…"),
        }),
      );
      const loggedMeta = mockLogger.warn.mock.calls[0]?.[1] as {
        endpoint?: string;
      };
      expect(loggedMeta.endpoint).not.toBe(endpoint);
    });

    it("calls custom logger.error on fetch subscriptions failure with hashed userId", async () => {
      mockFindMany.mockRejectedValue(new Error("DB error"));

      const mockLogger = { warn: vi.fn(), error: vi.fn() };

      const { sendPushToUser } = await import("@/lib/push");
      const result = await sendPushToUser(
        "user-1",
        { title: "Test", body: "Body" },
        mockLogger,
      );

      expect(result).toEqual({ sent: 0, failed: 0 });
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch push subscriptions",
        expect.objectContaining({ userIdHash: expect.any(String) }),
      );
      const loggedMeta = mockLogger.error.mock.calls[0]?.[1] as Record<
        string,
        unknown
      >;
      expect(loggedMeta).not.toHaveProperty("userId");
      expect(loggedMeta.userIdHash).not.toBe("user-1");
    });

    it("mixes sent and failed correctly across multiple subscriptions", async () => {
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
        {
          endpoint: "https://push.example.com/3",
          p256dh: "key3",
          auth: "auth3",
        },
      ]);
      mockSendNotification
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({});

      const { sendPushToUser } = await import("@/lib/push");
      const result = await sendPushToUser("user-1", {
        title: "Test",
        body: "Body",
      });

      expect(result).toEqual({ sent: 2, failed: 1 });
    });
  });
});
