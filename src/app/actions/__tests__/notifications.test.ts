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
  sql: vi.fn(),
  count: vi.fn(() => "count"),
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  notifications: {
    id: "id",
    userId: "userId",
    isRead: "isRead",
    createdAt: "createdAt",
    episodeId: "episodeId",
  },
  episodes: { id: "id", title: "title", podcastId: "podcastId", podcastIndexId: "podcastIndexId" },
  podcasts: { id: "id", title: "title" },
  users: { id: "id" },
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
          episodeId: 42,
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
