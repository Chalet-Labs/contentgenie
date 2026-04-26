import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/db/schema", () => ({
  notifications: {
    userId: "notifications.userId",
    isDismissed: "notifications.isDismissed",
    episodeId: "notifications.episodeId",
  },
}));

const mockReturning = vi.fn().mockResolvedValue([]);
const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

vi.mock("@/db", () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

describe("dismissNotificationsForEpisodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
  });

  it("issues an UPDATE on notifications with set({ isDismissed: true })", async () => {
    const { dismissNotificationsForEpisodes } =
      await import("@/app/actions/_internal/dismiss-notifications");
    await dismissNotificationsForEpisodes("user_123", [42]);

    const { notifications } = await import("@/db/schema");
    expect(mockUpdate).toHaveBeenCalledWith(notifications);
    expect(mockSet).toHaveBeenCalledWith({ isDismissed: true });
  });

  it("predicate is and(eq(userId, $1), eq(isDismissed, false), inArray(episodeId, $2))", async () => {
    const { dismissNotificationsForEpisodes } =
      await import("@/app/actions/_internal/dismiss-notifications");
    await dismissNotificationsForEpisodes("user_123", [42]);

    const { and, eq, inArray } = await import("drizzle-orm");
    const { notifications } = await import("@/db/schema");

    expect(eq).toHaveBeenCalledWith(notifications.userId, "user_123");
    expect(eq).toHaveBeenCalledWith(notifications.isDismissed, false);
    expect(inArray).toHaveBeenCalledWith(notifications.episodeId, [42]);
    expect(and).toHaveBeenCalled();
  });

  it("returns early ([]) without UPDATE when episodeIds is empty", async () => {
    const { dismissNotificationsForEpisodes } =
      await import("@/app/actions/_internal/dismiss-notifications");
    const result = await dismissNotificationsForEpisodes("user_123", []);

    expect(result).toEqual([]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("de-duplicates and filters non-positive / non-integer ids", async () => {
    const { dismissNotificationsForEpisodes } =
      await import("@/app/actions/_internal/dismiss-notifications");
    // Input has dupe 42, negative -1, zero 0, float 1.5, valid 10
    await dismissNotificationsForEpisodes("user_123", [42, 42, -1, 0, 1.5, 10]);

    const { inArray } = await import("drizzle-orm");
    const { notifications } = await import("@/db/schema");

    // Only [42, 10] are valid (order may vary from Set)
    const inArrayCall = (inArray as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    expect(inArrayCall[0]).toBe(notifications.episodeId);
    const passedIds = inArrayCall[1] as number[];
    expect(passedIds).toHaveLength(2);
    expect(passedIds).toContain(42);
    expect(passedIds).toContain(10);
  });

  it("returns early ([]) (no UPDATE) when all ids are filtered out", async () => {
    const { dismissNotificationsForEpisodes } =
      await import("@/app/actions/_internal/dismiss-notifications");
    const result = await dismissNotificationsForEpisodes(
      "user_123",
      [-1, 0, 1.5],
    );

    expect(result).toEqual([]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns episode ids actually flipped, deduped, with nulls dropped", async () => {
    mockReturning.mockResolvedValueOnce([
      { episodeId: 42 },
      { episodeId: 42 },
      { episodeId: 10 },
      { episodeId: null },
    ]);

    const { dismissNotificationsForEpisodes } =
      await import("@/app/actions/_internal/dismiss-notifications");
    const result = await dismissNotificationsForEpisodes(
      "user_123",
      [42, 10, 99],
    );

    expect(result).toHaveLength(2);
    expect(result).toContain(42);
    expect(result).toContain(10);
  });

  it("returns [] when no rows were already-dismissed-or-missing", async () => {
    mockReturning.mockResolvedValueOnce([]);

    const { dismissNotificationsForEpisodes } =
      await import("@/app/actions/_internal/dismiss-notifications");
    const result = await dismissNotificationsForEpisodes("user_123", [42]);

    expect(result).toEqual([]);
  });

  it("swallows DB errors, returns [], and calls console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbError = new Error("connection refused");
    mockReturning.mockRejectedValueOnce(dbError);

    const { dismissNotificationsForEpisodes } =
      await import("@/app/actions/_internal/dismiss-notifications");

    await expect(
      dismissNotificationsForEpisodes("user_123", [42]),
    ).resolves.toEqual([]);

    expect(errorSpy).toHaveBeenCalledWith(
      "[dismissNotificationsForEpisodes] failed",
      expect.objectContaining({ error: dbError }),
    );
    errorSpy.mockRestore();
  });
});
