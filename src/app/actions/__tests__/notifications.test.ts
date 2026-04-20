import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  asc: vi.fn((col: unknown) => col),
  sql: vi.fn(),
  count: vi.fn(() => "count"),
  inArray: vi.fn((...args: unknown[]) => args),
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  notifications: {
    id: "id",
    userId: "userId",
    isRead: "isRead",
    isDismissed: "isDismissed",
    createdAt: "createdAt",
    episodeId: "episodeId",
  },
  episodes: {
    id: "id",
    title: "title",
    podcastId: "podcastId",
    podcastIndexId: "podcastIndexId",
    audioUrl: "audioUrl",
    artwork: "artwork",
    duration: "duration",
    worthItScore: "worthItScore",
  },
  podcasts: { id: "id", title: "title", imageUrl: "imageUrl" },
  users: { id: "id" },
  episodeTopics: {
    id: "id",
    episodeId: "episodeId",
    topic: "topic",
    relevance: "relevance",
    topicRank: "topicRank",
  },
}));

// Mock DB
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    query: {
      users: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

describe("notification server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
  });

  describe("getUnreadCount", () => {
    it("returns 0 when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { getUnreadCount } = await import("@/app/actions/notifications");
      const count = await getUnreadCount();
      expect(count).toBe(0);
    });

    it("returns unread count for authenticated user", async () => {
      const mockFrom = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 5 }]),
      });
      mockSelect.mockReturnValue({ from: mockFrom });

      const { getUnreadCount } = await import("@/app/actions/notifications");
      const count = await getUnreadCount();
      expect(count).toBe(5);
    });
  });

  describe("markNotificationRead", () => {
    it("returns error when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { markNotificationRead } = await import("@/app/actions/notifications");
      const result = await markNotificationRead(1);
      expect(result.success).toBe(false);
      expect(result.error).toBe("You must be signed in");
    });

    it("marks notification as read for the owning user", async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markNotificationRead } = await import("@/app/actions/notifications");
      const result = await markNotificationRead(1);
      expect(result.success).toBe(true);
    });

    it("returns not found when notification does not belong to user", async () => {
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markNotificationRead } = await import("@/app/actions/notifications");
      const result = await markNotificationRead(999);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Notification not found");
    });
  });

  describe("markAllNotificationsRead", () => {
    it("returns error when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { markAllNotificationsRead } = await import("@/app/actions/notifications");
      const result = await markAllNotificationsRead();
      expect(result.success).toBe(false);
    });

    it("marks all unread notifications as read", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markAllNotificationsRead } = await import("@/app/actions/notifications");
      const result = await markAllNotificationsRead();
      expect(result.success).toBe(true);
    });
  });

  describe("updateNotificationPreferences", () => {
    it("returns error when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { updateNotificationPreferences } = await import(
        "@/app/actions/notifications"
      );
      const result = await updateNotificationPreferences({
        digestFrequency: "daily",
      });
      expect(result.success).toBe(false);
    });

    it("preserves existing preferences via read-modify-write", async () => {
      mockFindFirst.mockResolvedValue({
        preferences: { theme: "dark", defaultView: "grid" },
      });

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { updateNotificationPreferences } = await import(
        "@/app/actions/notifications"
      );
      const result = await updateNotificationPreferences({
        digestFrequency: "weekly",
      });

      expect(result.success).toBe(true);
      // Verify the merged preferences include both old and new fields
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: expect.objectContaining({
            theme: "dark",
            defaultView: "grid",
            digestFrequency: "weekly",
          }),
        })
      );
    });
  });

  describe("getNotifications", () => {
    it("returns empty array when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { getNotifications } = await import("@/app/actions/notifications");
      const result = await getNotifications();
      expect(result.notifications).toHaveLength(0);
      expect(result.error).toBe("You must be signed in");
    });

    it("returns notifications for authenticated user", async () => {
      const mockNotifications = [
        {
          id: 1,
          type: "new_episode",
          title: "Test Podcast",
          body: "New episode",
          isRead: false,
          createdAt: new Date(),
          episodePodcastIndexId: "PI-42",
          episodeTitle: "Test Episode",
          podcastTitle: "Test Podcast",
        },
      ];

      const mockOffset = vi.fn().mockResolvedValue(mockNotifications);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
      const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
      mockSelect.mockReturnValue({ from: mockFrom });

      const { getNotifications } = await import("@/app/actions/notifications");
      const result = await getNotifications();

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].type).toBe("new_episode");
      expect(result.notifications[0].episodePodcastIndexId).toBe("PI-42");
      expect(result.error).toBeNull();
    });

    it("returns error message on DB failure", async () => {
      const mockFrom = vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockRejectedValue(new Error("DB error")),
                }),
              }),
            }),
          }),
        }),
      });
      mockSelect.mockReturnValue({ from: mockFrom });

      const { getNotifications } = await import("@/app/actions/notifications");
      const result = await getNotifications();

      expect(result.notifications).toHaveLength(0);
      expect(result.error).toBe("Failed to load notifications");
    });
  });

  describe("getNotifications — isDismissed filter + extended shape", () => {
    function buildSelectChain(resolvedValue: unknown[]) {
      const mockOffset = vi.fn().mockResolvedValue(resolvedValue);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
      const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
      mockSelect.mockReturnValue({ from: mockFrom });
      return { mockWhere, mockLimit, mockOffset };
    }

    it("uses default limit of 50", async () => {
      const { mockLimit } = buildSelectChain([]);
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications();
      // Implementation fetches safeLimit + 1 as the has-more sentinel
      expect(mockLimit).toHaveBeenCalledWith(51);
    });

    it("clamps limit above 100 to 100", async () => {
      const { mockLimit } = buildSelectChain([]);
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications(200);
      expect(mockLimit).toHaveBeenCalledWith(101);
    });

    it("clamps limit below 1 to 1", async () => {
      const { mockLimit } = buildSelectChain([]);
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications(0);
      expect(mockLimit).toHaveBeenCalledWith(2);
    });

    it("select shape includes episodeDbId, worthItScore, audioUrl, artwork, duration", async () => {
      buildSelectChain([]);
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications();
      // Verify select was called with an object containing the expected keys
      const selectArg = mockSelect.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(selectArg).toHaveProperty("episodeDbId");
      expect(selectArg).toHaveProperty("worthItScore");
      expect(selectArg).toHaveProperty("audioUrl");
      expect(selectArg).toHaveProperty("artwork");
      expect(selectArg).toHaveProperty("duration");
    });

    it("WHERE clause includes isDismissed=false filter", async () => {
      const { mockWhere } = buildSelectChain([]);
      const { and: mockAnd, eq: mockEq } = await import("drizzle-orm");
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications();
      // and() should have been called — verifies isDismissed condition is present
      expect(mockAnd).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith("isDismissed", false);
      expect(mockWhere).toHaveBeenCalled();
    });

    it("hasMore is true when results.length > limit", async () => {
      // Returns 51 items for limit=50 → hasMore=true
      const items = Array.from({ length: 51 }, (_, i) => ({ id: i + 1 }));
      buildSelectChain(items);
      const { getNotifications } = await import("@/app/actions/notifications");
      const result = await getNotifications(50);
      expect(result.hasMore).toBe(true);
      expect(result.notifications).toHaveLength(50);
    });

    it("hasMore is false when results.length <= limit", async () => {
      const items = Array.from({ length: 3 }, (_, i) => ({ id: i + 1 }));
      buildSelectChain(items);
      const { getNotifications } = await import("@/app/actions/notifications");
      const result = await getNotifications(50);
      expect(result.hasMore).toBe(false);
      expect(result.notifications).toHaveLength(3);
    });
  });

  describe("getUnreadCount — excludes dismissed", () => {
    it("includes isDismissed=false in WHERE", async () => {
      const mockFrom = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 3 }]),
      });
      mockSelect.mockReturnValue({ from: mockFrom });
      const { eq: mockEq } = await import("drizzle-orm");
      const { getUnreadCount } = await import("@/app/actions/notifications");
      await getUnreadCount();
      expect(mockEq).toHaveBeenCalledWith("isDismissed", false);
    });
  });

  describe("dismissNotification", () => {
    it("returns error when unauthenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { dismissNotification } = await import("@/app/actions/notifications");
      const result = await dismissNotification(1);
      expect(result.success).toBe(false);
      expect(result.error).toBe("You must be signed in");
    });

    it("returns error for non-integer id", async () => {
      const { dismissNotification } = await import("@/app/actions/notifications");
      const result = await dismissNotification(1.5);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid notification id");
    });

    it("returns error for id <= 0", async () => {
      const { dismissNotification } = await import("@/app/actions/notifications");
      const result = await dismissNotification(0);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid notification id");
    });

    it("dismisses notification and returns success", async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: 5 }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { dismissNotification } = await import("@/app/actions/notifications");
      const result = await dismissNotification(5);
      expect(result.success).toBe(true);
      expect(mockSet).toHaveBeenCalledWith({ isDismissed: true });
    });

    it("returns not-found when notification belongs to another user", async () => {
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { dismissNotification } = await import("@/app/actions/notifications");
      const result = await dismissNotification(999);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Notification not found");
    });

    it("scopes update to userId (and() called with userId condition)", async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });
      const { and: mockAnd, eq: mockEq } = await import("drizzle-orm");

      const { dismissNotification } = await import("@/app/actions/notifications");
      await dismissNotification(1);
      expect(mockAnd).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith("userId", "user-1");
    });
  });

  describe("getEpisodeTopics", () => {
    const mockSelectTopic = vi.fn();

    function buildTopicChain(resolvedValue: unknown[]) {
      const mockOrderBy = vi.fn().mockResolvedValue(resolvedValue);
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockSelectTopic.mockReturnValue({ from: mockFrom });
      mockSelect.mockImplementation((...args: unknown[]) => mockSelectTopic(...args));
    }

    it("returns empty Map when unauthenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      const result = await getEpisodeTopics([1, 2]);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it("returns empty Map for empty episodeIds array", async () => {
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      const result = await getEpisodeTopics([]);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it("groups topics by episodeId and caps at 3 per episode", async () => {
      buildTopicChain([
        { episodeId: 1, topic: "Topic A", topicRank: 1, relevance: "0.90" },
        { episodeId: 1, topic: "Topic B", topicRank: 2, relevance: "0.80" },
        { episodeId: 1, topic: "Topic C", topicRank: 3, relevance: "0.70" },
        { episodeId: 1, topic: "Topic D", topicRank: 4, relevance: "0.60" },
        { episodeId: 2, topic: "Topic E", topicRank: 1, relevance: "0.95" },
      ]);
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      const result = await getEpisodeTopics([1, 2]);
      expect(result.get(1)).toHaveLength(3);
      expect(result.get(1)).toEqual(["Topic A", "Topic B", "Topic C"]);
      expect(result.get(2)).toHaveLength(1);
      expect(result.get(2)).toEqual(["Topic E"]);
    });

    it("uses inArray for episodeId filtering", async () => {
      buildTopicChain([]);
      const { inArray: mockInArray } = await import("drizzle-orm");
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      await getEpisodeTopics([1, 2, 3]);
      expect(mockInArray).toHaveBeenCalledWith("episodeId", [1, 2, 3]);
    });

    it("orders topicRank NULLS LAST so ranked topics win over unranked", async () => {
      buildTopicChain([]);
      const { sql: mockSql } = await import("drizzle-orm");
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      await getEpisodeTopics([1]);

      const sqlCalls = (mockSql as unknown as { mock: { calls: unknown[][] } })
        .mock.calls;
      const hasNullsLast = sqlCalls.some((call) =>
        (call[0] as readonly string[]).some((part) =>
          part.includes("NULLS LAST")
        )
      );
      expect(hasNullsLast).toBe(true);
    });
  });

  describe("getNotificationPreferences", () => {
    it("returns defaults when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { getNotificationPreferences } = await import("@/app/actions/notifications");
      const result = await getNotificationPreferences();
      expect(result.digestFrequency).toBe("realtime");
      expect(result.pushEnabled).toBe(false);
    });

    it("returns stored preferences for authenticated user", async () => {
      mockFindFirst.mockResolvedValue({
        preferences: { digestFrequency: "weekly", pushEnabled: true },
      });

      const { getNotificationPreferences } = await import("@/app/actions/notifications");
      const result = await getNotificationPreferences();
      expect(result.digestFrequency).toBe("weekly");
      expect(result.pushEnabled).toBe(true);
    });

    it("returns realtime/false defaults when user has no preferences set", async () => {
      mockFindFirst.mockResolvedValue({ preferences: null });

      const { getNotificationPreferences } = await import("@/app/actions/notifications");
      const result = await getNotificationPreferences();
      expect(result.digestFrequency).toBe("realtime");
      expect(result.pushEnabled).toBe(false);
    });
  });
});
