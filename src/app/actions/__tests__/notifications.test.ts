import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClerkAuthMock } from "@/test/mocks/clerk-server";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => makeClerkAuthMock(() => mockAuth()));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  asc: vi.fn((col: unknown) => col),
  gte: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(),
  count: vi.fn(() => "count"),
  inArray: vi.fn((...args: unknown[]) => args),
  groupBy: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn((...args: unknown[]) => args),
}));

// Mock schema. Column identifiers are table-qualified so assertions like
// eq("podcasts.id", 42) can distinguish a predicate that targets the wrong
// table (a real-world refactor hazard).
vi.mock("@/db/schema", () => ({
  notifications: {
    id: "notifications.id",
    userId: "notifications.userId",
    isRead: "notifications.isRead",
    isDismissed: "notifications.isDismissed",
    createdAt: "notifications.createdAt",
    episodeId: "notifications.episodeId",
    type: "notifications.type",
  },
  episodes: {
    id: "episodes.id",
    title: "episodes.title",
    podcastId: "episodes.podcastId",
    podcastIndexId: "episodes.podcastIndexId",
    audioUrl: "episodes.audioUrl",
    artwork: "episodes.artwork",
    duration: "episodes.duration",
    worthItScore: "episodes.worthItScore",
  },
  podcasts: {
    id: "podcasts.id",
    title: "podcasts.title",
    imageUrl: "podcasts.imageUrl",
  },
  users: { id: "users.id" },
  episodeTopics: {
    id: "episodeTopics.id",
    episodeId: "episodeTopics.episodeId",
    topic: "episodeTopics.topic",
    relevance: "episodeTopics.relevance",
    topicRank: "episodeTopics.topicRank",
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

    it("lets DB errors propagate so the caller can keep the last good count", async () => {
      const dbError = new Error("connection refused");
      const mockFrom = vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(dbError),
      });
      mockSelect.mockReturnValue({ from: mockFrom });

      const { getUnreadCount } = await import("@/app/actions/notifications");
      await expect(getUnreadCount()).rejects.toThrow("connection refused");
    });
  });

  describe("markNotificationRead", () => {
    it("returns error when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { markNotificationRead } =
        await import("@/app/actions/notifications");
      const result = await markNotificationRead(1);
      expect(result.success).toBe(false);
      expect(result.error).toBe("You must be signed in");
    });

    it("marks notification as read for the owning user", async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markNotificationRead } =
        await import("@/app/actions/notifications");
      const result = await markNotificationRead(1);
      expect(result.success).toBe(true);
    });

    it("returns not found when notification does not belong to user", async () => {
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markNotificationRead } =
        await import("@/app/actions/notifications");
      const result = await markNotificationRead(999);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Notification not found");
    });
  });

  describe("markAllNotificationsRead", () => {
    it("returns error when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { markAllNotificationsRead } =
        await import("@/app/actions/notifications");
      const result = await markAllNotificationsRead();
      expect(result.success).toBe(false);
    });

    it("marks all unread notifications as read", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markAllNotificationsRead } =
        await import("@/app/actions/notifications");
      const result = await markAllNotificationsRead();
      expect(result.success).toBe(true);
    });
  });

  describe("updateNotificationPreferences", () => {
    it("returns error when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { updateNotificationPreferences } =
        await import("@/app/actions/notifications");
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

      const { updateNotificationPreferences } =
        await import("@/app/actions/notifications");
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
        }),
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
      const mockLeftJoin1 = vi
        .fn()
        .mockReturnValue({ leftJoin: mockLeftJoin2 });
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
      const mockLeftJoin1 = vi
        .fn()
        .mockReturnValue({ leftJoin: mockLeftJoin2 });
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
      const selectArg = mockSelect.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
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
      expect(mockEq).toHaveBeenCalledWith("notifications.isDismissed", false);
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
      expect(mockEq).toHaveBeenCalledWith("notifications.isDismissed", false);
    });
  });

  describe("dismissNotification", () => {
    it("returns error when unauthenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { dismissNotification } =
        await import("@/app/actions/notifications");
      const result = await dismissNotification(1);
      expect(result.success).toBe(false);
      expect(result.error).toBe("You must be signed in");
    });

    it("returns error for non-integer id", async () => {
      const { dismissNotification } =
        await import("@/app/actions/notifications");
      const result = await dismissNotification(1.5);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid notification id");
    });

    it("returns error for id <= 0", async () => {
      const { dismissNotification } =
        await import("@/app/actions/notifications");
      const result = await dismissNotification(0);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid notification id");
    });

    it("dismisses notification and returns success", async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: 5 }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { dismissNotification } =
        await import("@/app/actions/notifications");
      const result = await dismissNotification(5);
      expect(result.success).toBe(true);
      expect(mockSet).toHaveBeenCalledWith({ isDismissed: true });
    });

    it("returns not-found when notification belongs to another user", async () => {
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { dismissNotification } =
        await import("@/app/actions/notifications");
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

      const { dismissNotification } =
        await import("@/app/actions/notifications");
      await dismissNotification(1);
      expect(mockAnd).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith("notifications.userId", "user-1");
    });
  });

  describe("getEpisodeTopics", () => {
    // mockReturnValueOnce queues persist across tests — reset before each so
    // a prior test's leftover one-shot returns don't bleed into the next.
    beforeEach(() => {
      mockSelect.mockReset();
    });

    // getEpisodeTopics now runs two queries: (1) notifications allowlist,
    // (2) episodeTopics lookup. The helper wires up sequential select() mocks
    // so each query in the real code pulls the next rowset in order.
    function buildTopicChain(
      notifRows: Array<{ episodeId: number | null }>,
      topicRows: unknown[],
    ) {
      const firstWhere = vi.fn().mockResolvedValue(notifRows);
      const firstFrom = vi.fn().mockReturnValue({ where: firstWhere });

      const secondOrderBy = vi.fn().mockResolvedValue(topicRows);
      const secondWhere = vi.fn().mockReturnValue({ orderBy: secondOrderBy });
      const secondFrom = vi.fn().mockReturnValue({ where: secondWhere });

      mockSelect
        .mockReturnValueOnce({ from: firstFrom })
        .mockReturnValueOnce({ from: secondFrom });
    }

    it("returns empty object when unauthenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      const result = await getEpisodeTopics([1, 2]);
      expect(result).toEqual({});
    });

    it("returns empty object for empty episodeIds array", async () => {
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      const result = await getEpisodeTopics([]);
      expect(result).toEqual({});
    });

    it("returns empty object when caller owns none of the requested episodes", async () => {
      buildTopicChain([], []);
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      const result = await getEpisodeTopics([1, 2]);
      expect(result).toEqual({});
    });

    it("groups topics by episodeId and caps at 3 per episode", async () => {
      buildTopicChain(
        [{ episodeId: 1 }, { episodeId: 2 }],
        [
          { episodeId: 1, topic: "Topic A", topicRank: 1, relevance: "0.90" },
          { episodeId: 1, topic: "Topic B", topicRank: 2, relevance: "0.80" },
          { episodeId: 1, topic: "Topic C", topicRank: 3, relevance: "0.70" },
          { episodeId: 1, topic: "Topic D", topicRank: 4, relevance: "0.60" },
          { episodeId: 2, topic: "Topic E", topicRank: 1, relevance: "0.95" },
        ],
      );
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      const result = await getEpisodeTopics([1, 2]);
      expect(result[1]).toHaveLength(3);
      expect(result[1]).toEqual(["Topic A", "Topic B", "Topic C"]);
      expect(result[2]).toHaveLength(1);
      expect(result[2]).toEqual(["Topic E"]);
    });

    it("uses inArray for episodeId filtering", async () => {
      buildTopicChain(
        [{ episodeId: 1 }, { episodeId: 2 }, { episodeId: 3 }],
        [],
      );
      const { inArray: mockInArray } = await import("drizzle-orm");
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      await getEpisodeTopics([1, 2, 3]);
      // Called twice: once for the notifications allowlist, once for episodeTopics.
      const calls = (mockInArray as unknown as { mock: { calls: unknown[][] } })
        .mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[calls.length - 1]).toEqual([
        "episodeTopics.episodeId",
        [1, 2, 3],
      ]);
    });

    it("orders topicRank NULLS LAST so ranked topics win over unranked", async () => {
      buildTopicChain([{ episodeId: 1 }], []);
      const { sql: mockSql } = await import("drizzle-orm");
      const { getEpisodeTopics } = await import("@/app/actions/notifications");
      await getEpisodeTopics([1]);

      const sqlCalls = (mockSql as unknown as { mock: { calls: unknown[][] } })
        .mock.calls;
      const hasNullsLast = sqlCalls.some((call) =>
        (call[0] as readonly string[]).some((part) =>
          part.includes("NULLS LAST"),
        ),
      );
      expect(hasNullsLast).toBe(true);
    });
  });

  describe("getNotificationPreferences", () => {
    it("returns defaults when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { getNotificationPreferences } =
        await import("@/app/actions/notifications");
      const result = await getNotificationPreferences();
      expect(result.digestFrequency).toBe("realtime");
      expect(result.pushEnabled).toBe(false);
    });

    it("returns stored preferences for authenticated user", async () => {
      mockFindFirst.mockResolvedValue({
        preferences: { digestFrequency: "weekly", pushEnabled: true },
      });

      const { getNotificationPreferences } =
        await import("@/app/actions/notifications");
      const result = await getNotificationPreferences();
      expect(result.digestFrequency).toBe("weekly");
      expect(result.pushEnabled).toBe(true);
    });

    it("returns realtime/false defaults when user has no preferences set", async () => {
      mockFindFirst.mockResolvedValue({ preferences: null });

      const { getNotificationPreferences } =
        await import("@/app/actions/notifications");
      const result = await getNotificationPreferences();
      expect(result.digestFrequency).toBe("realtime");
      expect(result.pushEnabled).toBe(false);
    });
  });

  describe("getNotificationSummary", () => {
    beforeEach(() => {
      mockSelect.mockReset();
    });

    // Wires up three sequential select() calls the producer makes:
    // 1. totalUnread (all unread types) → returns [{ value: number }]
    // 2. lastSeenAt   → returns [{ lastSeen: Date | null }]
    // 3. grouped rows → returns per-podcast rows
    function buildSummaryChain(
      totalUnread: number,
      lastSeenRow: Array<{ lastSeen: Date | string | null }>,
      groupRows: Array<{
        podcastId: number | null;
        podcastTitle: string | null;
        count: string;
      }>,
    ) {
      const firstWhere = vi.fn().mockResolvedValue([{ value: totalUnread }]);
      const firstFrom = vi.fn().mockReturnValue({ where: firstWhere });

      const secondWhere = vi.fn().mockResolvedValue(lastSeenRow);
      const secondFrom = vi.fn().mockReturnValue({ where: secondWhere });

      const thirdOrderBy = vi.fn().mockResolvedValue(groupRows);
      const thirdGroupBy = vi.fn().mockReturnValue({ orderBy: thirdOrderBy });
      const thirdWhere = vi.fn().mockReturnValue({ groupBy: thirdGroupBy });
      const thirdLeftJoin2 = vi.fn().mockReturnValue({ where: thirdWhere });
      const thirdLeftJoin1 = vi
        .fn()
        .mockReturnValue({ leftJoin: thirdLeftJoin2 });
      const thirdFrom = vi.fn().mockReturnValue({ leftJoin: thirdLeftJoin1 });

      mockSelect
        .mockReturnValueOnce({ from: firstFrom })
        .mockReturnValueOnce({ from: secondFrom })
        .mockReturnValueOnce({ from: thirdFrom });
    }

    it("(a) returns zero summary when signed out", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      const result = await getNotificationSummary();
      expect(result).toEqual({ totalUnread: 0, groups: [] });
    });

    it("(b) returns zero groups when user has no notifications", async () => {
      buildSummaryChain(0, [{ lastSeen: null }], []);
      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      const result = await getNotificationSummary();
      expect(result.totalUnread).toBe(0);
      expect(result.groups).toEqual([]);
    });

    it("(c) returns single podcast group when all unread from one podcast", async () => {
      buildSummaryChain(
        3,
        [{ lastSeen: null }],
        [{ podcastId: 1, podcastTitle: "Test Pod", count: "3" }],
      );
      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      const result = await getNotificationSummary();
      expect(result.totalUnread).toBe(3);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]).toEqual({
        kind: "episodes_by_podcast",
        podcastId: 1,
        podcastTitle: "Test Pod",
        count: 3,
      });
    });

    it("(d) multiple podcast groups sorted by count DESC, podcastTitle ASC", async () => {
      buildSummaryChain(
        7,
        [{ lastSeen: null }],
        [
          { podcastId: 2, podcastTitle: "Alpha Pod", count: "5" },
          { podcastId: 3, podcastTitle: "Beta Pod", count: "2" },
        ],
      );
      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      const result = await getNotificationSummary();
      expect(result.totalUnread).toBe(7);
      expect(result.groups[0]).toMatchObject({
        kind: "episodes_by_podcast",
        podcastId: 2,
      });
      expect(result.groups[1]).toMatchObject({
        kind: "episodes_by_podcast",
        podcastId: 3,
      });
    });

    it("(e) emits episodes_since_last_seen with sinceIso when unread-since < newEpisodeUnread", async () => {
      const lastSeen = new Date("2026-04-01T00:00:00Z");
      buildSummaryChain(
        5,
        [{ lastSeen }],
        [
          { podcastId: 1, podcastTitle: "Pod A", count: "3" },
          { podcastId: 2, podcastTitle: "Pod B", count: "2" },
        ],
      );
      // Simulate: 2 are newer than lastSeen, 3 are older → since_count < newEpisodeUnread (5)
      const fourthWhere = vi.fn().mockResolvedValue([{ sinceCount: "2" }]);
      const fourthFrom = vi.fn().mockReturnValue({ where: fourthWhere });
      mockSelect.mockReturnValueOnce({ from: fourthFrom });

      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      const result = await getNotificationSummary();
      const sinceGroup = result.groups.find(
        (g) => g.kind === "episodes_since_last_seen",
      );
      expect(sinceGroup).toBeDefined();
      expect(sinceGroup).toEqual({
        kind: "episodes_since_last_seen",
        count: 2,
        sinceIso: lastSeen.toISOString(),
      });
    });

    it("(f) omits episodes_since_last_seen when since_count equals newEpisodeUnread", async () => {
      const lastSeen = new Date("2026-04-01T00:00:00Z");
      buildSummaryChain(
        3,
        [{ lastSeen }],
        [{ podcastId: 1, podcastTitle: "Pod A", count: "3" }],
      );
      const fourthWhere = vi.fn().mockResolvedValue([{ sinceCount: "3" }]);
      const fourthFrom = vi.fn().mockReturnValue({ where: fourthWhere });
      mockSelect.mockReturnValueOnce({ from: fourthFrom });

      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      const result = await getNotificationSummary();
      const sinceGroup = result.groups.find(
        (g) => g.kind === "episodes_since_last_seen",
      );
      expect(sinceGroup).toBeUndefined();
    });

    it("(g) omits episodes_since_last_seen when lastSeenAt is null", async () => {
      buildSummaryChain(
        3,
        [{ lastSeen: null }],
        [{ podcastId: 1, podcastTitle: "Pod A", count: "3" }],
      );
      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      const result = await getNotificationSummary();
      const sinceGroup = result.groups.find(
        (g) => g.kind === "episodes_since_last_seen",
      );
      expect(sinceGroup).toBeUndefined();
    });

    it("(h) dismissed notifications excluded from groups", async () => {
      buildSummaryChain(0, [{ lastSeen: null }], []);
      const { eq: mockEq } = await import("drizzle-orm");
      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      await getNotificationSummary();
      expect(mockEq).toHaveBeenCalledWith("notifications.isDismissed", false);
    });

    it("(i) read notifications excluded from groups (isRead = false predicate)", async () => {
      buildSummaryChain(0, [{ lastSeen: null }], []);
      const { eq: mockEq } = await import("drizzle-orm");
      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      await getNotificationSummary();
      expect(mockEq).toHaveBeenCalledWith("notifications.isRead", false);
    });

    it("(j) summary_completed null-podcast rows dropped from groups; totalUnread still includes them", async () => {
      // Mixed fixture: 2 valid podcast groups + 1 null-podcast row the grouped query returned
      // (e.g., an orphaned summary_completed row that snuck through). The defensive
      // podcastGroups filter at the producer should drop the null row. totalUnread
      // (from the all-types query) is 6: 5 new_episode + 1 other unread.
      buildSummaryChain(
        6,
        [{ lastSeen: null }],
        [
          { podcastId: 1, podcastTitle: "Pod A", count: "3" },
          { podcastId: 2, podcastTitle: "Pod B", count: "2" },
          { podcastId: null, podcastTitle: null, count: "1" },
        ],
      );
      const { eq: mockEq } = await import("drizzle-orm");
      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      const result = await getNotificationSummary();
      // totalUnread reflects ALL unread (parity with getUnreadCount).
      expect(result.totalUnread).toBe(6);
      // groups drop the null-podcast row; only two valid podcast groups survive.
      expect(result.groups).toHaveLength(2);
      expect(result.groups.every((g) => g.kind === "episodes_by_podcast")).toBe(
        true,
      );
      // type='new_episode' predicate must be applied on the grouped query.
      expect(mockEq).toHaveBeenCalledWith("notifications.type", "new_episode");
    });

    it("(k) totalUnread counts ALL unread types (legacy rows) — stays in sync with badge", async () => {
      // 4 total unread: 2 new_episode + 2 summary_completed
      buildSummaryChain(
        4,
        [{ lastSeen: null }],
        [{ podcastId: 1, podcastTitle: "Pod A", count: "2" }],
      );
      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      const result = await getNotificationSummary();
      expect(result.totalUnread).toBe(4);
      // groups still only contain the 2 new_episode rows
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]).toMatchObject({ count: 2 });
    });

    it("(l) logs and rethrows on DB failure so server has a trail", async () => {
      const dbError = new Error("connection refused");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // Queries run concurrently via Promise.all — reject the first, stub
      // the other two so their chains don't TypeError on undefined.
      const rejectingWhere = vi.fn().mockRejectedValue(dbError);
      const rejectingFrom = vi.fn().mockReturnValue({ where: rejectingWhere });

      const stubWhere = vi.fn().mockResolvedValue([]);
      const stubFrom = vi.fn().mockReturnValue({ where: stubWhere });

      const stubOrderBy = vi.fn().mockResolvedValue([]);
      const stubGroupBy = vi.fn().mockReturnValue({ orderBy: stubOrderBy });
      const stubGroupedWhere = vi
        .fn()
        .mockReturnValue({ groupBy: stubGroupBy });
      const stubLeftJoin2 = vi
        .fn()
        .mockReturnValue({ where: stubGroupedWhere });
      const stubLeftJoin1 = vi
        .fn()
        .mockReturnValue({ leftJoin: stubLeftJoin2 });
      const stubGroupedFrom = vi
        .fn()
        .mockReturnValue({ leftJoin: stubLeftJoin1 });

      mockSelect
        .mockReturnValueOnce({ from: rejectingFrom })
        .mockReturnValueOnce({ from: stubFrom })
        .mockReturnValueOnce({ from: stubGroupedFrom });

      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      await expect(getNotificationSummary()).rejects.toThrow(
        "connection refused",
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "Error fetching notification summary:",
        dbError,
      );
      errorSpy.mockRestore();
    });

    it("(m) rehydrates string lastSeen from Neon HTTP driver into Date for gte + toISOString", async () => {
      // Regression for production TypeError: e.toISOString is not a function.
      // Raw `sql<...>` aggregates bypass Drizzle's PgTimestamp.mapFromDriverValue,
      // so Neon's HTTP driver returns MAX(created_at) as a string. The action must
      // rehydrate before passing to `gte(...)` or calling `.toISOString()`.
      const lastSeenIso = "2026-04-01T00:00:00.000Z";
      buildSummaryChain(
        5,
        [{ lastSeen: lastSeenIso }],
        [
          { podcastId: 1, podcastTitle: "Pod A", count: "3" },
          { podcastId: 2, podcastTitle: "Pod B", count: "2" },
        ],
      );
      const fourthWhere = vi.fn().mockResolvedValue([{ sinceCount: "2" }]);
      const fourthFrom = vi.fn().mockReturnValue({ where: fourthWhere });
      mockSelect.mockReturnValueOnce({ from: fourthFrom });

      const { getNotificationSummary } =
        await import("@/app/actions/notifications");
      const result = await getNotificationSummary();
      expect(result.groups).toContainEqual({
        kind: "episodes_since_last_seen",
        count: 2,
        sinceIso: new Date(lastSeenIso).toISOString(),
      });
    });
  });

  describe("getNotifications — filter parameter", () => {
    beforeEach(() => {
      mockSelect.mockReset();
    });

    function buildFilteredChain(resolvedValue: unknown[]) {
      const mockOffset = vi.fn().mockResolvedValue(resolvedValue);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
      const mockLeftJoin1 = vi
        .fn()
        .mockReturnValue({ leftJoin: mockLeftJoin2 });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
      mockSelect.mockReturnValue({ from: mockFrom });
      return { mockWhere };
    }

    it("(a) podcastId filter: eq called against podcasts.id (NOT notifications.id)", async () => {
      const { mockWhere } = buildFilteredChain([]);
      const { eq: mockEq } = await import("drizzle-orm");
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications(50, 0, { podcastId: 42 });
      // Load-bearing: the predicate MUST target podcasts.id. If a refactor
      // accidentally writes eq(notifications.id, 42) this assertion catches it.
      expect(mockEq).toHaveBeenCalledWith("podcasts.id", 42);
      expect(mockEq).not.toHaveBeenCalledWith("notifications.id", 42);
      expect(mockWhere).toHaveBeenCalled();
    });

    it("(b) since filter: gte called with since date", async () => {
      buildFilteredChain([]);
      const { gte: mockGte } = await import("drizzle-orm");
      const since = new Date("2026-04-20T00:00:00Z");
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications(50, 0, { since });
      expect(mockGte).toHaveBeenCalledWith("notifications.createdAt", since);
    });

    it("(c) invalid podcastId (0) is ignored — same as no filter", async () => {
      buildFilteredChain([]);
      const { gte: mockGte } = await import("drizzle-orm");
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications(50, 0, { podcastId: 0 });
      expect(mockGte).not.toHaveBeenCalled();
    });

    it("(c) invalid podcastId (negative) is ignored", async () => {
      buildFilteredChain([]);
      const { gte: mockGte } = await import("drizzle-orm");
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications(50, 0, { podcastId: -5 });
      expect(mockGte).not.toHaveBeenCalled();
    });

    it("(d) invalid since (Invalid Date) is ignored", async () => {
      buildFilteredChain([]);
      const { gte: mockGte } = await import("drizzle-orm");
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications(50, 0, { since: new Date("not-a-date") });
      expect(mockGte).not.toHaveBeenCalled();
    });

    it("(e) combined podcast+since filter applies both predicates", async () => {
      buildFilteredChain([]);
      const { eq: mockEq, gte: mockGte } = await import("drizzle-orm");
      const since = new Date("2026-04-20T00:00:00Z");
      const { getNotifications } = await import("@/app/actions/notifications");
      await getNotifications(50, 0, { podcastId: 42, since });
      expect(mockEq).toHaveBeenCalledWith("podcasts.id", 42);
      expect(mockGte).toHaveBeenCalledWith("notifications.createdAt", since);
    });
  });
});
