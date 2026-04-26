import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeClerkAuthMock } from "@/test/mocks/clerk-server";
import { asPodcastIndexEpisodeId } from "@/types/ids";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => makeClerkAuthMock(() => mockAuth()));

// Mock database
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();
const mockFindFirst = vi.fn();
const mockSelectWhere = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            onConflictDoUpdate: (opts: unknown) => {
              mockOnConflictDoUpdate(opts);
              return Promise.resolve();
            },
          };
        },
      };
    },
    select: (_cols: unknown) => ({
      from: (_table: unknown) => ({
        where: (...args: unknown[]) => mockSelectWhere(...args),
      }),
    }),
    query: {
      episodes: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

// Mock helpers
const mockEnsureUserExists = vi.fn();
vi.mock("@/db/helpers", () => ({
  ensureUserExists: (...args: unknown[]) => mockEnsureUserExists(...args),
}));

// Mock dismiss helper
const mockDismissNotificationsForEpisodes = vi
  .fn()
  .mockResolvedValue(undefined);
vi.mock("@/app/actions/_internal/dismiss-notifications", () => ({
  dismissNotificationsForEpisodes: (...args: unknown[]) =>
    mockDismissNotificationsForEpisodes(...args),
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  listenHistory: {
    userId: "userId",
    episodeId: "episodeId",
    podcastIndexEpisodeId: "podcastIndexEpisodeId",
    startedAt: "startedAt",
    completedAt: "completedAt",
    listenDurationSeconds: "listenDurationSeconds",
    updatedAt: "updatedAt",
  },
  episodes: {
    podcastIndexId: "podcastIndexId",
  },
}));

// Mock drizzle-orm sql tag and eq
vi.mock("drizzle-orm", () => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _sql: strings.join("?"),
    _values: values,
  })),
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...conditions: unknown[]) => ({ _and: conditions })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({
    _inArray: { col, vals },
  })),
  isNotNull: vi.fn((col: unknown) => ({ _isNotNull: col })),
}));

describe("recordListenEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirst.mockResolvedValue({ id: 42 });
    mockEnsureUserExists.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns { success: false } when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("12345"),
    });
    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns { success: false } when episode not found", async () => {
    mockFindFirst.mockResolvedValue(undefined);
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("99999"),
    });
    expect(result).toEqual({ success: false, error: "Episode not found" });
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect(mockEnsureUserExists).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("calls db.insert with correct values for a started event", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("99999"),
    });
    expect(result.success).toBe(true);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledTimes(1);
    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues).toMatchObject({
      userId: "user_123",
      episodeId: 42,
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("99999"),
    });
    expect(insertedValues.startedAt).toBeInstanceOf(Date);
  });

  it("calls db.insert with correct values for a completed event", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("777"),
      completed: true,
      durationSeconds: 1800,
    });
    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues).toMatchObject({
      userId: "user_123",
      episodeId: 42,
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("777"),
      listenDurationSeconds: 1800,
    });
    expect(insertedValues.startedAt).toBeInstanceOf(Date);
    expect(insertedValues.completedAt).toBeInstanceOf(Date);
  });

  it("uses onConflictDoUpdate with COALESCE for startedAt (preserves first listen)", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("111"),
    });
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
    const upsertOpts = mockOnConflictDoUpdate.mock.calls[0][0];
    // Conflict target must include both userId and episodeId columns
    expect(upsertOpts).toHaveProperty("target");
    expect(Array.isArray(upsertOpts.target)).toBe(true);
    expect(upsertOpts.target).toHaveLength(2);
    expect(upsertOpts).toHaveProperty("set");
    // updatedAt must always be refreshed
    expect(upsertOpts.set).toHaveProperty("updatedAt");
    // startedAt must use COALESCE to preserve the first listen time
    expect(upsertOpts.set.startedAt).toHaveProperty("_sql");
    expect(upsertOpts.set.startedAt._sql).toContain("COALESCE");
    // completedAt should preserve existing value for a non-completion event
    expect(upsertOpts.set.completedAt).toHaveProperty("_sql");
    // listenDurationSeconds should preserve existing value when no duration provided
    expect(upsertOpts.set.listenDurationSeconds).toHaveProperty("_sql");
  });

  it("uses GREATEST for listenDurationSeconds on completed events", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("111"),
      completed: true,
      durationSeconds: 1800,
    });
    const upsertOpts = mockOnConflictDoUpdate.mock.calls[0][0];
    // completedAt should be a Date (not a sql template) for completion events
    expect(upsertOpts.set.completedAt).toBeInstanceOf(Date);
    // listenDurationSeconds must use GREATEST with COALESCE to handle NULL
    expect(upsertOpts.set.listenDurationSeconds).toHaveProperty("_sql");
    expect(upsertOpts.set.listenDurationSeconds._sql).toContain("GREATEST");
    expect(upsertOpts.set.listenDurationSeconds._sql).toContain("COALESCE");
  });

  it("calls ensureUserExists before inserting", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("12345"),
    });
    expect(mockEnsureUserExists).toHaveBeenCalledWith("user_123");
    expect(mockEnsureUserExists).toHaveBeenCalledTimes(1);
    // ensureUserExists must be called before insert
    const ensureOrder = mockEnsureUserExists.mock.invocationCallOrder[0];
    const insertOrder = mockInsert.mock.invocationCallOrder[0];
    expect(ensureOrder).toBeLessThan(insertOrder);
  });

  it("returns { success: false } when durationSeconds is negative", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("12345"),
      durationSeconds: -10,
    });
    expect(result).toEqual({
      success: false,
      error: "Invalid durationSeconds",
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns { success: false } when durationSeconds is not an integer", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("12345"),
      durationSeconds: 3.14,
    });
    expect(result).toEqual({
      success: false,
      error: "Invalid durationSeconds",
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns { success: false } when podcastIndexEpisodeId is empty", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId(""),
    });
    expect(result).toEqual({ success: false, error: "Invalid input" });
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns { success: false } when the DB insert throws", async () => {
    mockOnConflictDoUpdate.mockImplementationOnce(() => {
      throw new Error("DB failure");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("12345"),
    });
    expect(result).toEqual({
      success: false,
      error: "Failed to record listen event",
    });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("on completed:true success, returns { success: true, data: { episodeDbId: 42 } }", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("777"),
      completed: true,
    });
    expect(result).toEqual({ success: true, data: { episodeDbId: 42 } });
  });

  it("on completed:true success, dismiss helper is invoked once with (userId, [episodeDbId])", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("777"),
      completed: true,
    });
    expect(mockDismissNotificationsForEpisodes).toHaveBeenCalledTimes(1);
    expect(mockDismissNotificationsForEpisodes).toHaveBeenCalledWith(
      "user_123",
      [42],
    );
  });

  it("on completed omitted, dismiss helper NOT invoked; result still success", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("777"),
    });
    expect(result.success).toBe(true);
    expect(mockDismissNotificationsForEpisodes).not.toHaveBeenCalled();
  });

  it("helper rejection does NOT change result success or data.episodeDbId", async () => {
    mockDismissNotificationsForEpisodes.mockRejectedValueOnce(
      new Error("dismiss failed"),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { recordListenEvent } = await import("@/app/actions/listen-history");
    const result = await recordListenEvent({
      podcastIndexEpisodeId: asPodcastIndexEpisodeId("777"),
      completed: true,
    });
    expect(result).toEqual({ success: true, data: { episodeDbId: 42 } });
    consoleSpy.mockRestore();
  });
});

describe("getListenedEpisodeIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockSelectWhere.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array when unauthenticated without touching the DB", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { getListenedEpisodeIds } =
      await import("@/app/actions/listen-history");
    const result = await getListenedEpisodeIds([1, 2, 3]);
    expect(result).toEqual([]);
    expect(mockSelectWhere).not.toHaveBeenCalled();
  });

  it("returns empty array for empty input without touching the DB", async () => {
    const { getListenedEpisodeIds } =
      await import("@/app/actions/listen-history");
    const result = await getListenedEpisodeIds([]);
    expect(result).toEqual([]);
    expect(mockSelectWhere).not.toHaveBeenCalled();
  });

  it("returns an array of episodeIds returned by the query", async () => {
    mockSelectWhere.mockResolvedValue([{ id: 10 }, { id: 42 }, { id: 99 }]);
    const { getListenedEpisodeIds } =
      await import("@/app/actions/listen-history");
    const result = await getListenedEpisodeIds([10, 42, 99, 200]);
    expect(result).toEqual([10, 42, 99]);
  });

  it("filters by userId, episodeId, and completedAt IS NOT NULL", async () => {
    mockSelectWhere.mockResolvedValue([]);
    const { getListenedEpisodeIds } =
      await import("@/app/actions/listen-history");
    await getListenedEpisodeIds([10, 42]);

    const whereArg = mockSelectWhere.mock.calls[0][0] as {
      _and: Array<Record<string, unknown>>;
    };
    expect(whereArg).toHaveProperty("_and");
    const predicates = whereArg._and;
    // userId must be pinned to the current user — prevents cross-user leaks.
    const userIdPredicate = predicates.find(
      (p) => p.col === "userId" && p.val === "user_123",
    );
    // episodeId must be scoped to the requested batch.
    const episodeIdPredicate = predicates.find(
      (p) =>
        (p as { _inArray?: { col: unknown; vals: unknown[] } })._inArray
          ?.col === "episodeId",
    ) as { _inArray: { col: unknown; vals: number[] } } | undefined;
    // completedAt IS NOT NULL — exclude partial plays recorded by the audio player.
    const completedAtPredicate = predicates.find(
      (p) => (p as { _isNotNull?: unknown })._isNotNull === "completedAt",
    );
    expect(userIdPredicate).toBeDefined();
    expect(episodeIdPredicate).toBeDefined();
    expect(episodeIdPredicate?._inArray.vals).toEqual([10, 42]);
    expect(completedAtPredicate).toBeDefined();
  });

  it("dedupes, drops non-positive-integer ids, and caps the batch at 500", async () => {
    mockSelectWhere.mockResolvedValue([]);
    const { getListenedEpisodeIds } =
      await import("@/app/actions/listen-history");

    // Mix of duplicates, zero, negatives, and non-integers — all must be sanitized out.
    await getListenedEpisodeIds([5, 5, -3, 0, 1.5, Number.NaN, 10] as number[]);

    const whereArg = mockSelectWhere.mock.calls[0][0] as {
      _and: Array<Record<string, unknown>>;
    };
    const episodeIdPredicate = whereArg._and.find(
      (p) =>
        (p as { _inArray?: { col: unknown; vals: unknown[] } })._inArray
          ?.col === "episodeId",
    ) as { _inArray: { col: unknown; vals: number[] } } | undefined;
    expect(episodeIdPredicate?._inArray.vals).toEqual([5, 10]);

    // 600 ints → should be capped to 500.
    mockSelectWhere.mockClear();
    mockSelectWhere.mockResolvedValue([]);
    const manyIds = Array.from({ length: 600 }, (_, i) => i + 1);
    await getListenedEpisodeIds(manyIds);

    const whereArg2 = mockSelectWhere.mock.calls[0][0] as {
      _and: Array<Record<string, unknown>>;
    };
    const episodeIdPredicate2 = whereArg2._and.find(
      (p) =>
        (p as { _inArray?: { col: unknown; vals: unknown[] } })._inArray
          ?.col === "episodeId",
    ) as { _inArray: { col: unknown; vals: number[] } } | undefined;
    expect(episodeIdPredicate2?._inArray.vals).toHaveLength(500);
  });

  it("returns empty array when all input ids are invalid (no DB hit)", async () => {
    const { getListenedEpisodeIds } =
      await import("@/app/actions/listen-history");
    const result = await getListenedEpisodeIds([
      -1,
      0,
      1.5,
      Number.NaN,
    ] as number[]);
    expect(result).toEqual([]);
    expect(mockSelectWhere).not.toHaveBeenCalled();
  });

  it("returns empty array and logs when DB throws", async () => {
    mockSelectWhere.mockRejectedValueOnce(new Error("DB boom"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getListenedEpisodeIds } =
      await import("@/app/actions/listen-history");
    const result = await getListenedEpisodeIds([1, 2]);
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
