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
const mockUpdate = vi.fn();
const mockUserSubsFindMany = vi.fn();
const mockUsersFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    query: {
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
  notifications: { userId: "userId", episodeId: "episodeId" },
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
  sql: vi.fn((...args: unknown[]) => args),
}));

describe("trigger/helpers/notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSendPushToUser.mockResolvedValue({ sent: 1, failed: 0 });
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("resolvePodcastId", () => {
    it("returns internal podcast ID for a valid PodcastIndex ID", async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 42 });

      const { resolvePodcastId } =
        await import("@/trigger/helpers/notifications");
      const result = await resolvePodcastId("12345");

      expect(result).toBe(42);
    });

    it("returns null when podcast is not found", async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      const { resolvePodcastId } =
        await import("@/trigger/helpers/notifications");
      const result = await resolvePodcastId("nonexistent");

      expect(result).toBeNull();
    });

    it("accepts numeric PodcastIndex ID and converts to string", async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 7 });

      const { resolvePodcastId } =
        await import("@/trigger/helpers/notifications");
      const result = await resolvePodcastId(99999);

      expect(result).toBe(7);
    });
  });

  describe("createEpisodeNotifications", () => {
    const singleEpisode = [
      {
        episodeId: 100,
        podcastIndexEpisodeId: "PI-100",
        title: "Test Podcast",
        body: "New episode: Test Episode",
      },
    ];

    const stubInsertChain = (returning: unknown[]) => {
      const mockReturning = vi.fn().mockResolvedValue(returning);
      const mockOnConflict = vi
        .fn()
        .mockReturnValue({ returning: mockReturning });
      const mockValues = vi
        .fn()
        .mockReturnValue({ onConflictDoNothing: mockOnConflict });
      mockInsert.mockReturnValue({ values: mockValues });
      return { mockReturning, mockOnConflict, mockValues };
    };

    it("inserts one row per (subscriber, episode) pair across the batch", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-1" },
        { userId: "user-2" },
      ]);
      const { mockValues } = stubInsertChain([]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, [
        {
          episodeId: 100,
          podcastIndexEpisodeId: "PI-100",
          title: "Test Podcast",
          body: "New episode: Ep X",
        },
        {
          episodeId: 101,
          podcastIndexEpisodeId: "PI-101",
          title: "Test Podcast",
          body: "New episode: Ep Y",
        },
      ]);

      // 2 subscribers × 2 episodes = 4 records
      expect(mockValues.mock.calls[0][0]).toHaveLength(4);
      expect(mockValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userId: "user-1",
            episodeId: 100,
            type: "new_episode",
          }),
          expect.objectContaining({
            userId: "user-1",
            episodeId: 101,
            type: "new_episode",
          }),
          expect.objectContaining({
            userId: "user-2",
            episodeId: 100,
            type: "new_episode",
          }),
          expect.objectContaining({
            userId: "user-2",
            episodeId: 101,
            type: "new_episode",
          }),
        ]),
      );
    });

    it("body starts with 'New episode: '", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      const { mockValues } = stubInsertChain([]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, singleEpisode);

      expect(mockValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            body: expect.stringMatching(/^New episode: /),
          }),
        ]),
      );
    });

    it("uses onConflictDoNothing with userId and episodeId as target", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      const { mockOnConflict } = stubInsertChain([]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, singleEpisode);

      expect(mockOnConflict).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.arrayContaining(["userId", "episodeId"]),
        }),
      );
    });

    it("dispatches push with tag=episode-${episodeId} for realtime users whose row was inserted", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);
      stubInsertChain([{ userId: "user-realtime", episodeId: 100 }]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, singleEpisode);

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({ tag: "episode-100" }),
        expect.anything(),
      );
    });

    it("push URL derives from each episode's podcastIndexEpisodeId", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);
      stubInsertChain([{ userId: "user-realtime", episodeId: 100 }]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, [
        {
          episodeId: 100,
          podcastIndexEpisodeId: "PI-999",
          title: "Test Podcast",
          body: "New episode: Test",
        },
      ]);

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({
          data: expect.objectContaining({ url: "/episode/PI-999" }),
        }),
        expect.anything(),
      );
    });

    it("skips push entirely when all rows conflict (empty .returning())", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      stubInsertChain([]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, singleEpisode);

      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });

    it("only pushes to users whose row was actually inserted (partial conflict)", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-a" },
        { userId: "user-b" },
      ]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-a",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
        {
          id: "user-b",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);
      stubInsertChain([{ userId: "user-a", episodeId: 100 }]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, singleEpisode);

      expect(mockSendPushToUser).toHaveBeenCalledTimes(1);
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-a",
        expect.anything(),
        expect.anything(),
      );
    });

    it("groups pushes by episode — each recipient gets the right tag+url per episode", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-1",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);
      stubInsertChain([
        { userId: "user-1", episodeId: 100 },
        { userId: "user-1", episodeId: 101 },
      ]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, [
        {
          episodeId: 100,
          podcastIndexEpisodeId: "PI-100",
          title: "Show",
          body: "New episode: A",
        },
        {
          episodeId: 101,
          podcastIndexEpisodeId: "PI-101",
          title: "Show",
          body: "New episode: B",
        },
      ]);

      expect(mockSendPushToUser).toHaveBeenCalledTimes(2);
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          tag: "episode-100",
          data: { url: "/episode/PI-100" },
        }),
        expect.anything(),
      );
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          tag: "episode-101",
          data: { url: "/episode/PI-101" },
        }),
        expect.anything(),
      );
    });

    it("passes the partial-index where predicate to onConflictDoNothing", async () => {
      // Postgres requires index_predicate to infer a partial unique index.
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      const { mockOnConflict } = stubInsertChain([]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, singleEpisode);

      expect(mockOnConflict).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.anything() }),
      );
    });

    it("no-ops when episodes array is empty", async () => {
      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, []);

      expect(mockUserSubsFindMany).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });

    it("no-ops when no subscribers have notifications enabled", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, singleEpisode);

      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });

    it("does not dispatch push for non-realtime users (prefs filter)", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-daily" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-daily",
          preferences: { digestFrequency: "daily", pushEnabled: true },
        },
      ]);
      stubInsertChain([{ userId: "user-daily", episodeId: 100 }]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, singleEpisode);

      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });

    it("queries prefs only for inserted userIds, not all subscribers", async () => {
      // realtimePushTargets now takes only affected rows — confirm prefs
      // lookup scope matches .returning() users, not the full subscriber set.
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-inserted" },
        { userId: "user-conflicted" },
      ]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-inserted",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);
      stubInsertChain([{ userId: "user-inserted", episodeId: 100 }]);

      const { createEpisodeNotifications } =
        await import("@/trigger/helpers/notifications");
      await createEpisodeNotifications(1, singleEpisode);

      expect(mockUsersFindMany).toHaveBeenCalledTimes(1);
      // prefs query received only the inserted userId, not both subscribers
      const callArg = mockUsersFindMany.mock.calls[0][0];
      expect(JSON.stringify(callArg)).toContain("user-inserted");
      expect(JSON.stringify(callArg)).not.toContain("user-conflicted");
    });
  });

  describe("markSummaryReady", () => {
    it("updates body starting with 'Summary ready: ' and sets isRead=false", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-1" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } =
        await import("@/trigger/helpers/notifications");
      await markSummaryReady(
        1,
        100,
        "PI-100",
        "Test Podcast",
        "Summary ready: Test Episode",
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringMatching(/^Summary ready: /),
          isRead: false,
        }),
      );
    });

    it("updates title in the set clause", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-1" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } =
        await import("@/trigger/helpers/notifications");
      await markSummaryReady(
        1,
        100,
        "PI-100",
        "Test Podcast",
        "Summary ready: Test Episode",
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Test Podcast" }),
      );
    });

    it("set() contains exactly body/title/isRead — no updatedAt or other stray keys", async () => {
      // `notifications` has no `updatedAt` column (ADR-035).
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-1" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } =
        await import("@/trigger/helpers/notifications");
      await markSummaryReady(
        1,
        100,
        "PI-100",
        "Test Podcast",
        "Summary ready: Test Episode",
      );

      expect(mockSet).toHaveBeenCalledTimes(1);
      expect(mockSet.mock.calls[0][0]).toEqual({
        body: "Summary ready: Test Episode",
        title: "Test Podcast",
        isRead: false,
      });
    });

    it("dispatches push with tag=episode-${episodeId} for realtime users whose row was updated", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);

      const mockReturning = vi
        .fn()
        .mockResolvedValue([{ userId: "user-realtime" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } =
        await import("@/trigger/helpers/notifications");
      await markSummaryReady(
        1,
        100,
        "PI-100",
        "Test Podcast",
        "Summary ready: Test Episode",
      );

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({ tag: "episode-100" }),
        expect.anything(),
      );
    });

    it("returns silently with zero DB changes and zero pushes when no rows match", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-1",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } =
        await import("@/trigger/helpers/notifications");
      await markSummaryReady(
        1,
        100,
        "PI-100",
        "Test Podcast",
        "Summary ready: Test Episode",
      );

      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });

    it("only dispatches push to users whose row was actually updated", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-updated" },
        { userId: "user-not-updated" },
      ]);
      // realtimePushTargets now queries prefs only for the updated userIds,
      // so the mock returns only user-updated — matching what `IN (...)`
      // filtered on .returning() would yield in real DB.
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-updated",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);

      // Only user-updated had a matching row
      const mockReturning = vi
        .fn()
        .mockResolvedValue([{ userId: "user-updated" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } =
        await import("@/trigger/helpers/notifications");
      await markSummaryReady(
        1,
        100,
        "PI-100",
        "Test Podcast",
        "Summary ready: Test Episode",
      );

      expect(mockSendPushToUser).toHaveBeenCalledTimes(1);
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-updated",
        expect.anything(),
        expect.anything(),
      );
    });

    it("no-ops entirely when no subscribers exist", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([]);

      const { markSummaryReady } =
        await import("@/trigger/helpers/notifications");
      await markSummaryReady(
        1,
        100,
        "PI-100",
        "Test Podcast",
        "Summary ready: Test Episode",
      );

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });

    it("push URL derives from podcastIndexEpisodeId", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);

      const mockReturning = vi
        .fn()
        .mockResolvedValue([{ userId: "user-realtime" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } =
        await import("@/trigger/helpers/notifications");
      await markSummaryReady(
        1,
        100,
        "PI-456",
        "Test Podcast",
        "Summary ready: Test Episode",
      );

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({
          data: expect.objectContaining({ url: "/episode/PI-456" }),
        }),
        expect.anything(),
      );
    });
  });
});
