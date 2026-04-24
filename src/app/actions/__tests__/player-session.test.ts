import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AudioEpisode } from "@/contexts/audio-player-context";
import {
  createDrizzleOrmMock,
  happyPathSetup,
  makeClerkAuthMock,
  makeDeleteChain,
  makeInsertConflictChain,
  makeUserHelpersMock,
  testDbError,
  testUnauthenticated,
  validEpisode,
} from "@/app/actions/__tests__/__fixtures";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => makeClerkAuthMock(() => mockAuth()));

// Mock database
const mockInsert = vi.fn();
const mockInsertValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();
const mockDelete = vi.fn();
const mockDeleteWhere = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: makeInsertConflictChain(
      mockInsert,
      mockInsertValues,
      mockOnConflictDoUpdate,
    ),
    delete: makeDeleteChain(mockDelete, mockDeleteWhere),
    query: {
      userPlayerSession: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

// Mock helpers
const mockEnsureUserExists = vi.fn();
vi.mock("@/db/helpers", () =>
  makeUserHelpersMock((...args: unknown[]) => mockEnsureUserExists(...args)),
);

// Mock schema
vi.mock("@/db/schema", () => ({
  userPlayerSession: {
    userId: "userId",
    episodeId: "episodeId",
    title: "title",
    podcastTitle: "podcastTitle",
    audioUrl: "audioUrl",
    artwork: "artwork",
    duration: "duration",
    chaptersUrl: "chaptersUrl",
    currentTime: "currentTime",
    updatedAt: "updatedAt",
  },
}));

// Mock drizzle-orm (shared factory lives in __fixtures.ts)
vi.mock("drizzle-orm", () => createDrizzleOrmMock());

const importAction = async () => import("@/app/actions/player-session");

describe("getPlayerSession", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  beforeEach(() => {
    mockFindFirst.mockResolvedValue(null);
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    mockDeleteWhere.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it(
    "returns { success: false, error } when unauthenticated",
    testUnauthenticated(
      mockAuth,
      async () => (await importAction()).getPlayerSession(),
      mockFindFirst,
    ),
  );

  it("returns { success: true, data: null } when no row exists", async () => {
    mockFindFirst.mockResolvedValue(null);
    const { getPlayerSession } = await importAction();
    const result = await getPlayerSession();
    expect(result).toEqual({ success: true, data: null });
    // Scope regression guard: findFirst must filter by the signed-in userId.
    // `eq` is mocked to return `{ col, val }` so we can assert the predicate.
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { col: "userId", val: "user_123" },
    });
  });

  it("does not call ensureUserExists (read-only path)", async () => {
    const { getPlayerSession } = await importAction();
    await getPlayerSession();
    expect(mockEnsureUserExists).not.toHaveBeenCalled();
  });

  it("returns episode reassembled from denormalized columns with currentTime as number", async () => {
    const dbRow = {
      userId: "user_123",
      episodeId: "ep-1",
      title: "Test Episode",
      podcastTitle: "Test Podcast",
      audioUrl: "https://example.com/audio.mp3",
      artwork: "https://example.com/art.jpg",
      duration: 600,
      chaptersUrl: null,
      currentTime: "123.456",
      updatedAt: new Date(),
    };
    mockFindFirst.mockResolvedValue(dbRow);
    const { getPlayerSession } = await importAction();
    const result = await getPlayerSession();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("should be success");
    expect(result.data).not.toBeNull();
    expect(result.data!.currentTime).toBe(123.456);
    expect(result.data!.episode).toEqual({
      id: "ep-1",
      title: "Test Episode",
      podcastTitle: "Test Podcast",
      audioUrl: "https://example.com/audio.mp3",
      artwork: "https://example.com/art.jpg",
      duration: 600,
    });
  });

  it(
    "returns { success: false, error } on DB error",
    testDbError(mockFindFirst, async () =>
      (await importAction()).getPlayerSession(),
    ),
  );
});

describe("savePlayerSession", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  beforeEach(() => {
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    mockDeleteWhere.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it(
    "returns { success: false, error } when unauthenticated",
    testUnauthenticated(
      mockAuth,
      async () => (await importAction()).savePlayerSession(validEpisode, 120),
      mockInsert,
    ),
  );

  it("Zod-rejects an invalid payload without touching the DB", async () => {
    const { savePlayerSession } = await importAction();
    const badEpisode = {
      id: "ep-1",
      title: "T",
      podcastTitle: "P",
      audioUrl: "not-a-url",
    };
    const result = await savePlayerSession(badEpisode as AudioEpisode, 120);
    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockEnsureUserExists).not.toHaveBeenCalled();
  });

  it("Zod-rejects currentTime above the upper bound without touching the DB", async () => {
    const { savePlayerSession } = await importAction();
    const result = await savePlayerSession(validEpisode, 1_000_001);
    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockEnsureUserExists).not.toHaveBeenCalled();
  });

  it("calls ensureUserExists before the insert", async () => {
    const { savePlayerSession } = await importAction();
    await savePlayerSession(validEpisode, 120);
    expect(mockEnsureUserExists).toHaveBeenCalledWith("user_123");
    const ensureOrder = mockEnsureUserExists.mock.invocationCallOrder[0];
    const insertOrder = mockInsert.mock.invocationCallOrder[0];
    expect(ensureOrder).toBeLessThan(insertOrder);
  });

  it("uses onConflictDoUpdate targeting userPlayerSession.userId with updatedAt Date in set", async () => {
    const { savePlayerSession } = await importAction();
    await savePlayerSession(validEpisode, 120);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
    const opts = mockOnConflictDoUpdate.mock.calls[0][0];
    expect(opts.target).toBe("userId");
    expect(opts).toHaveProperty("set");
    expect(opts.set.updatedAt).toBeInstanceOf(Date);
    // The conflict update set must NOT include the userId key — that's the
    // conflict target and re-setting it is a semantic no-op that muddies intent.
    expect(opts.set).not.toHaveProperty("userId");
  });

  it("persists currentTime as a decimal string", async () => {
    const { savePlayerSession } = await importAction();
    await savePlayerSession(validEpisode, 123.456);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(typeof insertedValues.currentTime).toBe("string");
    expect(insertedValues.currentTime).toMatch(/^\d+(\.\d+)?$/);
  });

  it(
    "returns { success: false, error } on DB error",
    testDbError(mockOnConflictDoUpdate, async () =>
      (await importAction()).savePlayerSession(validEpisode, 120),
    ),
  );
});

describe("clearPlayerSession", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  beforeEach(() => {
    mockDeleteWhere.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it(
    "returns { success: false, error } when unauthenticated",
    testUnauthenticated(
      mockAuth,
      async () => (await importAction()).clearPlayerSession(),
      mockDelete,
    ),
  );

  it("issues DELETE WHERE userId = $user on success", async () => {
    const { clearPlayerSession } = await importAction();
    const result = await clearPlayerSession();
    expect(result).toEqual({ success: true });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    // Scope regression guard: the DELETE must filter by the signed-in userId.
    expect(mockDeleteWhere).toHaveBeenCalledWith({
      col: "userId",
      val: "user_123",
    });
  });

  it("does not call ensureUserExists (DELETE is no-op on nonexistent user)", async () => {
    const { clearPlayerSession } = await importAction();
    await clearPlayerSession();
    expect(mockEnsureUserExists).not.toHaveBeenCalled();
  });

  it(
    "returns { success: false, error } on DB error",
    testDbError(mockDeleteWhere, async () =>
      (await importAction()).clearPlayerSession(),
    ),
  );
});
