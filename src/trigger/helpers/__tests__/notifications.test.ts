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

  describe("createEpisodeNotifications", () => {
    it("inserts one row per subscriber with notificationsEnabled=true", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-1" },
        { userId: "user-2" },
      ]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
        { id: "user-2", preferences: {} },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
      mockInsert.mockReturnValue({ values: mockValues });

      const { createEpisodeNotifications } = await import(
        "@/trigger/helpers/notifications"
      );
      await createEpisodeNotifications(1, 100, "PI-100", "Test Podcast", "New episode: Test Episode");

      expect(mockValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: "user-1", type: "new_episode" }),
          expect.objectContaining({ userId: "user-2", type: "new_episode" }),
        ])
      );
      expect(mockValues.mock.calls[0][0]).toHaveLength(2);
    });

    it("body starts with 'New episode: '", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
      mockInsert.mockReturnValue({ values: mockValues });

      const { createEpisodeNotifications } = await import(
        "@/trigger/helpers/notifications"
      );
      await createEpisodeNotifications(1, 100, "PI-100", "Test Podcast", "New episode: Test Episode");

      expect(mockValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ body: expect.stringMatching(/^New episode: /) }),
        ])
      );
    });

    it("uses onConflictDoNothing with userId and episodeId as target", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
      mockInsert.mockReturnValue({ values: mockValues });

      const { createEpisodeNotifications } = await import(
        "@/trigger/helpers/notifications"
      );
      await createEpisodeNotifications(1, 100, "PI-100", "Test Podcast", "New episode: Test Episode");

      expect(mockOnConflict).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.arrayContaining(["userId", "episodeId"]) })
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

      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-realtime" }]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
      mockInsert.mockReturnValue({ values: mockValues });

      const { createEpisodeNotifications } = await import(
        "@/trigger/helpers/notifications"
      );
      await createEpisodeNotifications(1, 100, "PI-100", "Test Podcast", "New episode: Test Episode");

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({ tag: "episode-100" }),
        expect.anything()
      );
    });

    it("push URL derives from podcastIndexEpisodeId without a DB lookup", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-realtime" }]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
      mockInsert.mockReturnValue({ values: mockValues });

      const { createEpisodeNotifications } = await import(
        "@/trigger/helpers/notifications"
      );
      await createEpisodeNotifications(1, 100, "PI-999", "Test Podcast", "New episode: Test");

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({ data: expect.objectContaining({ url: "/episode/PI-999" }) }),
        expect.anything()
      );
    });

    it("skips push entirely when all rows conflict (empty .returning())", async () => {
      // All subscribers' rows already exist from a prior poll — onConflictDoNothing
      // swallows the inserts, .returning() is empty, no push should fire.
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-realtime" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-realtime",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
      mockInsert.mockReturnValue({ values: mockValues });

      const { createEpisodeNotifications } = await import(
        "@/trigger/helpers/notifications"
      );
      await createEpisodeNotifications(1, 100, "PI-100", "Test Podcast", "New episode: Test Episode");

      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });

    it("only pushes to users whose row was actually inserted (partial conflict)", async () => {
      // user-a and user-b both subscribe; only user-a's row is new this poll.
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-a" },
        { userId: "user-b" },
      ]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-a", preferences: { digestFrequency: "realtime", pushEnabled: true } },
        { id: "user-b", preferences: { digestFrequency: "realtime", pushEnabled: true } },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-a" }]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
      mockInsert.mockReturnValue({ values: mockValues });

      const { createEpisodeNotifications } = await import(
        "@/trigger/helpers/notifications"
      );
      await createEpisodeNotifications(1, 100, "PI-100", "Test Podcast", "New episode: Test Episode");

      expect(mockSendPushToUser).toHaveBeenCalledTimes(1);
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-a",
        expect.anything(),
        expect.anything()
      );
    });

    it("passes the partial-index where predicate to onConflictDoNothing", async () => {
      // Postgres requires an explicit index_predicate matching the partial unique
      // index (WHERE episode_id IS NOT NULL) to infer it as the conflict arbiter.
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
      mockInsert.mockReturnValue({ values: mockValues });

      const { createEpisodeNotifications } = await import(
        "@/trigger/helpers/notifications"
      );
      await createEpisodeNotifications(1, 100, "PI-100", "Test Podcast", "New episode: Test Episode");

      expect(mockOnConflict).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.anything() })
      );
    });

    it("no-ops when no subscribers have notifications enabled", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([]);

      const { createEpisodeNotifications } = await import(
        "@/trigger/helpers/notifications"
      );
      await createEpisodeNotifications(1, 100, "PI-100", "Test Podcast", "New episode: Test");

      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });

    it("does not dispatch push for non-realtime users", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-daily" },
      ]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-daily",
          preferences: { digestFrequency: "daily", pushEnabled: true },
        },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
      mockInsert.mockReturnValue({ values: mockValues });

      const { createEpisodeNotifications } = await import(
        "@/trigger/helpers/notifications"
      );
      await createEpisodeNotifications(1, 100, "PI-100", "Test Podcast", "New episode: Test");

      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });
  });

  describe("markSummaryReady", () => {
    it("updates body starting with 'Summary ready: ' and sets isRead=false", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-1" },
      ]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-1" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } = await import(
        "@/trigger/helpers/notifications"
      );
      await markSummaryReady(1, 100, "PI-100", "Test Podcast", "Summary ready: Test Episode");

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringMatching(/^Summary ready: /),
          isRead: false,
        })
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

      const { markSummaryReady } = await import(
        "@/trigger/helpers/notifications"
      );
      await markSummaryReady(1, 100, "PI-100", "Test Podcast", "Summary ready: Test Episode");

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Test Podcast" })
      );
    });

    it("set() contains exactly body/title/isRead — no updatedAt or other stray keys", async () => {
      // Schema invariant (ADR-035): the `notifications` table has no `updatedAt`
      // column. Adding it to the set clause would crash production silently —
      // this strict assertion pins the three allowed keys and will fail if a
      // future refactor reintroduces `updatedAt` or adds any other field.
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: {} },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-1" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } = await import(
        "@/trigger/helpers/notifications"
      );
      await markSummaryReady(1, 100, "PI-100", "Test Podcast", "Summary ready: Test Episode");

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

      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-realtime" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } = await import(
        "@/trigger/helpers/notifications"
      );
      await markSummaryReady(1, 100, "PI-100", "Test Podcast", "Summary ready: Test Episode");

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({ tag: "episode-100" }),
        expect.anything()
      );
    });

    it("returns silently with zero DB changes and zero pushes when no rows match", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([{ userId: "user-1" }]);
      mockUsersFindMany.mockResolvedValueOnce([
        { id: "user-1", preferences: { digestFrequency: "realtime", pushEnabled: true } },
      ]);

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } = await import(
        "@/trigger/helpers/notifications"
      );
      await markSummaryReady(1, 100, "PI-100", "Test Podcast", "Summary ready: Test Episode");

      expect(mockSendPushToUser).not.toHaveBeenCalled();
    });

    it("only dispatches push to users whose row was actually updated", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([
        { userId: "user-updated" },
        { userId: "user-not-updated" },
      ]);
      mockUsersFindMany.mockResolvedValueOnce([
        {
          id: "user-updated",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
        {
          id: "user-not-updated",
          preferences: { digestFrequency: "realtime", pushEnabled: true },
        },
      ]);

      // Only user-updated had a matching row
      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-updated" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } = await import(
        "@/trigger/helpers/notifications"
      );
      await markSummaryReady(1, 100, "PI-100", "Test Podcast", "Summary ready: Test Episode");

      expect(mockSendPushToUser).toHaveBeenCalledTimes(1);
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-updated",
        expect.anything(),
        expect.anything()
      );
    });

    it("no-ops entirely when no subscribers exist", async () => {
      mockUserSubsFindMany.mockResolvedValueOnce([]);

      const { markSummaryReady } = await import(
        "@/trigger/helpers/notifications"
      );
      await markSummaryReady(1, 100, "PI-100", "Test Podcast", "Summary ready: Test Episode");

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

      const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-realtime" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet });

      const { markSummaryReady } = await import(
        "@/trigger/helpers/notifications"
      );
      await markSummaryReady(1, 100, "PI-456", "Test Podcast", "Summary ready: Test Episode");

      expect(mockSendPushToUser).toHaveBeenCalledWith(
        "user-realtime",
        expect.objectContaining({ data: expect.objectContaining({ url: "/episode/PI-456" }) }),
        expect.anything()
      );
    });
  });
});
