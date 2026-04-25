import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDrizzleOrmMock,
  happyPathSetup,
  makeClerkAuthMock,
  testDbError,
} from "@/app/actions/__tests__/__fixtures";

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => makeClerkAuthMock(() => mockAuth()));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

// db.insert(...).values(...).onConflictDo(Update|Nothing)?().returning?()
const mockInsert = vi.fn();
const mockInsertValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();
const mockOnConflictDoNothing = vi.fn();
const mockInsertReturning = vi.fn();

// db.select(...).from(...).innerJoin(...).where(...).limit?(n)
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockSelectWhere = vi.fn();
const mockLimit = vi.fn();

// db.update(...).set(...).where(...) — awaited directly (no .returning())
const mockUpdate = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();

// db.delete(...).where(...) — awaited directly
const mockDelete = vi.fn();
const mockDeleteWhere = vi.fn();

// db.query.*.findFirst / findMany
const mockEpisodesFindFirst = vi.fn();
const mockUserLibraryFindFirst = vi.fn();
const mockUserLibraryFindMany = vi.fn();
const mockBookmarksFindFirst = vi.fn();
const mockBookmarksFindMany = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockInsertValues(...vArgs);
          return {
            onConflictDoUpdate: (opts: unknown) => {
              mockOnConflictDoUpdate(opts);
              return { returning: () => mockInsertReturning() };
            },
            onConflictDoNothing: () => {
              mockOnConflictDoNothing();
              return { returning: () => mockInsertReturning() };
            },
            returning: () => mockInsertReturning(),
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            innerJoin: (...jArgs: unknown[]) => {
              mockInnerJoin(...jArgs);
              // .where() must be awaitable: getEpisodeAverageRating awaits
              // the chain directly; isEpisodeSaved/getLibraryEntryByEpisodeId
              // chain .limit(n) instead.
              const afterWhere = {
                limit: (n: number) => mockLimit(n),
                then: (
                  onFulfilled?: ((v: unknown) => unknown) | null,
                  onRejected?: ((r: unknown) => unknown) | null,
                ) =>
                  Promise.resolve(mockSelectWhere()).then(
                    onFulfilled,
                    onRejected,
                  ),
              };
              return {
                where: (...wArgs: unknown[]) => {
                  mockSelectWhere(...wArgs);
                  return afterWhere;
                },
              };
            },
            where: (...wArgs: unknown[]) => {
              mockSelectWhere(...wArgs);
              return { limit: (n: number) => mockLimit(n) };
            },
          };
        },
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockUpdateSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockUpdateWhere(...wArgs);
              return {
                returning: () => mockInsertReturning(),
                then: (
                  onFulfilled?: ((v: unknown) => unknown) | null,
                  onRejected?: ((r: unknown) => unknown) | null,
                ) => Promise.resolve(undefined).then(onFulfilled, onRejected),
              };
            },
          };
        },
      };
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return {
        where: (...wArgs: unknown[]) => {
          mockDeleteWhere(...wArgs);
          return Promise.resolve(undefined);
        },
      };
    },
    query: {
      episodes: {
        findFirst: (...args: unknown[]) => mockEpisodesFindFirst(...args),
      },
      userLibrary: {
        findFirst: (...args: unknown[]) => mockUserLibraryFindFirst(...args),
        findMany: (...args: unknown[]) => mockUserLibraryFindMany(...args),
      },
      bookmarks: {
        findFirst: (...args: unknown[]) => mockBookmarksFindFirst(...args),
        findMany: (...args: unknown[]) => mockBookmarksFindMany(...args),
      },
    },
  },
}));

const mockEnsureUserExists = vi.fn();
const mockUpsertPodcast = vi.fn();
vi.mock("@/db/helpers", () => ({
  ensureUserExists: (...args: unknown[]) => mockEnsureUserExists(...args),
  upsertPodcast: (...args: unknown[]) => mockUpsertPodcast(...args),
}));

vi.mock("@/db/schema", () => ({
  episodes: { id: "id", podcastIndexId: "podcastIndexId" },
  userLibrary: {
    id: "id",
    userId: "userId",
    episodeId: "episodeId",
    savedAt: "savedAt",
    notes: "notes",
    rating: "rating",
    collectionId: "collectionId",
  },
  bookmarks: {
    id: "id",
    userLibraryId: "userLibraryId",
    timestamp: "timestamp",
    note: "note",
  },
}));

// Mock @/db/library-columns (column constants are just shape stubs at runtime)
vi.mock("@/db/library-columns", () => ({
  LIBRARY_ENTRY_COLUMNS: {},
  EPISODE_LIST_COLUMNS: {},
  PODCAST_LIST_COLUMNS: {},
  COLLECTION_LIST_COLUMNS: {},
}));

const mockSafeParse = vi.fn();
const mockSafeParseDate = vi.fn();
vi.mock("@/lib/schemas/library", () => ({
  saveEpisodeSchema: {
    safeParse: (...args: unknown[]) => mockSafeParse(...args),
  },
  safeParseDate: (...args: unknown[]) => mockSafeParseDate(...args),
}));

vi.mock("drizzle-orm", () => ({
  ...createDrizzleOrmMock(),
  and: vi.fn((...conds: unknown[]) => ({ _and: conds })),
  desc: vi.fn((col: unknown) => ({ col, direction: "desc" })),
  isNotNull: vi.fn((col: unknown) => ({ _isNotNull: col })),
  avg: vi.fn((col: unknown) => ({ _avg: col })),
  count: vi.fn((col: unknown) => ({ _count: col })),
}));

const importLibrary = async () => import("@/app/actions/library");

// File-level reset so queued .mockReturnValueOnce / .mockImplementation values
// from one describe block don't leak into the next. happyPathSetup() (which
// uses vi.clearAllMocks) only clears call history, not implementations.
beforeEach(() => {
  vi.resetAllMocks();
});

const validEpisodeData = {
  podcastIndexId: "ep1",
  title: "Episode 1",
  description: "An episode",
  audioUrl: "https://example.com/a.mp3",
  duration: 600,
  publishDate: new Date("2026-01-01T00:00:00Z"),
  podcast: {
    podcastIndexId: "pod1",
    title: "Podcast 1",
    description: "A podcast",
    publisher: "Pub",
    imageUrl: "https://example.com/img.jpg",
    rssFeedUrl: "https://example.com/rss",
    categories: ["Tech"],
    totalEpisodes: 10,
  },
};

// ── saveEpisodeToLibrary ──────────────────────────────────────────────────
describe("saveEpisodeToLibrary", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  beforeEach(() => {
    mockSafeParse.mockReturnValue({
      success: true,
      data: {
        ...validEpisodeData,
        publishDate: validEpisodeData.publishDate.toISOString(),
        podcast: validEpisodeData.podcast,
      },
    });
    mockSafeParseDate.mockReturnValue(validEpisodeData.publishDate);
    mockUpsertPodcast.mockResolvedValue(42);
    mockInsertReturning
      .mockReturnValueOnce([{ id: 100 }]) // episodes upsert
      .mockReturnValueOnce([{ id: 1000 }]); // library insert
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns success and revalidates paths on happy path", async () => {
    const { saveEpisodeToLibrary } = await importLibrary();
    const result = await saveEpisodeToLibrary(validEpisodeData);
    expect(result).toEqual({
      success: true,
      message: "Episode saved to library",
    });
    expect(mockUpsertPodcast).toHaveBeenCalledWith(
      expect.objectContaining({ podcastIndexId: "pod1" }),
      { updateOnConflict: "safe" },
    );
    // The episode insert builds its row from the parsed Zod payload + the
    // upserted podcast id — pin those mappings so a swap of fields like
    // (podcastIndexId ↔ title) doesn't slip through.
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        podcastId: 42,
        podcastIndexId: "ep1",
        title: "Episode 1",
        audioUrl: "https://example.com/a.mp3",
        duration: 600,
        publishDate: validEpisodeData.publishDate,
      }),
    );
    expect(mockInsertValues).toHaveBeenCalledWith({
      userId: "user_123",
      episodeId: 100,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/episode/ep1");
  });

  it("returns 'already in library' when library insert returns empty", async () => {
    mockInsertReturning.mockReset();
    mockInsertReturning
      .mockReturnValueOnce([{ id: 100 }])
      .mockReturnValueOnce([]); // already in library
    const { saveEpisodeToLibrary } = await importLibrary();
    const result = await saveEpisodeToLibrary(validEpisodeData);
    expect(result).toEqual({
      success: true,
      message: "Episode already in library",
    });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { saveEpisodeToLibrary } = await importLibrary();
    const result = await saveEpisodeToLibrary(validEpisodeData);
    expect(result).toEqual({
      success: false,
      error: "You must be signed in to save episodes",
    });
    expect(mockUpsertPodcast).not.toHaveBeenCalled();
  });

  it("returns 'Invalid episode data' when zod validation fails", async () => {
    mockSafeParse.mockReturnValue({
      success: false,
      error: { issues: [{ message: "bad" }] },
    });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { saveEpisodeToLibrary } = await importLibrary();
    const result = await saveEpisodeToLibrary(validEpisodeData);
    expect(result).toEqual({ success: false, error: "Invalid episode data" });
    expect(mockUpsertPodcast).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("returns generic error when DB throws", async () => {
    mockUpsertPodcast.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { saveEpisodeToLibrary } = await importLibrary();
    const result = await saveEpisodeToLibrary(validEpisodeData);
    expect(result).toEqual({
      success: false,
      error: "Failed to save episode. Please try again.",
    });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("handles missing publishDate (no toISOString call)", async () => {
    const noDate = { ...validEpisodeData, publishDate: undefined };
    mockSafeParse.mockReturnValue({
      success: true,
      data: { ...noDate, podcast: noDate.podcast },
    });
    const { saveEpisodeToLibrary } = await importLibrary();
    const result = await saveEpisodeToLibrary(noDate);
    expect(result.success).toBe(true);
  });
});

// ── removeEpisodeFromLibrary ──────────────────────────────────────────────
describe("removeEpisodeFromLibrary", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  afterEach(() => vi.restoreAllMocks());

  it("removes episode and revalidates paths", async () => {
    mockEpisodesFindFirst.mockResolvedValue({ id: 42 });
    const { removeEpisodeFromLibrary } = await importLibrary();
    const result = await removeEpisodeFromLibrary("ep1");
    expect(result).toEqual({
      success: true,
      message: "Episode removed from library",
    });
    // DELETE must be scoped to the current user — without the userId
    // predicate any signed-in user could delete any other user's row by
    // knowing the episode's PodcastIndex id.
    expect(mockDeleteWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        _and: expect.arrayContaining([
          { col: "userId", val: "user_123" },
          { col: "episodeId", val: 42 },
        ]),
      }),
    );
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/episode/ep1");
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { removeEpisodeFromLibrary } = await importLibrary();
    const result = await removeEpisodeFromLibrary("ep1");
    expect(result.success).toBe(false);
    expect(mockEpisodesFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'Episode not found' when episode missing", async () => {
    mockEpisodesFindFirst.mockResolvedValue(undefined);
    const { removeEpisodeFromLibrary } = await importLibrary();
    const result = await removeEpisodeFromLibrary("ep1");
    expect(result).toEqual({ success: false, error: "Episode not found" });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it(
    "returns generic error when DB throws",
    testDbError(mockEpisodesFindFirst, async () => {
      const { removeEpisodeFromLibrary } = await importLibrary();
      return removeEpisodeFromLibrary("ep1");
    }),
  );
});

// ── isEpisodeSaved ────────────────────────────────────────────────────────
describe("isEpisodeSaved", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  afterEach(() => vi.restoreAllMocks());

  it("returns true when query returns a row", async () => {
    mockLimit.mockResolvedValue([{ id: 1 }]);
    const { isEpisodeSaved } = await importLibrary();
    expect(await isEpisodeSaved("ep1")).toBe(true);
  });

  it("returns false when query returns empty", async () => {
    mockLimit.mockResolvedValue([]);
    const { isEpisodeSaved } = await importLibrary();
    expect(await isEpisodeSaved("ep1")).toBe(false);
  });

  it("returns false when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { isEpisodeSaved } = await importLibrary();
    expect(await isEpisodeSaved("ep1")).toBe(false);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns false when DB throws", async () => {
    mockLimit.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { isEpisodeSaved } = await importLibrary();
    expect(await isEpisodeSaved("ep1")).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── getUserLibrary ────────────────────────────────────────────────────────
describe("getUserLibrary", () => {
  // Build a small in-memory list of items the underlying findMany returns;
  // tests assert the JS sort logic ordered them correctly.
  const itemA = {
    id: 1,
    userId: "user_123",
    episodeId: 10,
    savedAt: new Date("2026-01-01T00:00:00Z"),
    notes: null,
    rating: 3,
    collectionId: null,
    episode: {
      id: 10,
      title: "Banana",
      publishDate: new Date("2025-12-01T00:00:00Z"),
      podcast: { id: 1 },
    },
    collection: null,
  };
  const itemB = {
    id: 2,
    userId: "user_123",
    episodeId: 11,
    savedAt: new Date("2026-02-01T00:00:00Z"),
    notes: null,
    rating: 5,
    collectionId: null,
    episode: {
      id: 11,
      title: "Apple",
      publishDate: new Date("2026-01-15T00:00:00Z"),
      podcast: { id: 1 },
    },
    collection: null,
  };
  const itemC = {
    id: 3,
    userId: "user_123",
    episodeId: 12,
    savedAt: new Date("2025-11-01T00:00:00Z"),
    notes: null,
    rating: null,
    collectionId: null,
    episode: {
      id: 12,
      title: "Cherry",
      publishDate: undefined,
      podcast: { id: 1 },
    },
    collection: null,
  };

  // Second null-rating / null-publishDate item lets us exercise the a-side
  // of `(a.rating ?? -1) - (b.rating ?? -1)` and the publish-date fallback.
  const itemD = {
    id: 4,
    userId: "user_123",
    episodeId: 13,
    savedAt: new Date("2025-10-01T00:00:00Z"),
    notes: null,
    rating: null,
    collectionId: null,
    episode: {
      id: 13,
      title: "Date",
      publishDate: undefined,
      podcast: { id: 1 },
    },
    collection: null,
  };

  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  beforeEach(() => {
    mockUserLibraryFindMany.mockResolvedValue([itemA, itemB, itemC]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("sorts by savedAt desc by default (newest first)", async () => {
    const { getUserLibrary } = await importLibrary();
    const result = await getUserLibrary();
    expect(result.error).toBeNull();
    expect(result.items.map((i) => i.id)).toEqual([2, 1, 3]);
    // findMany must be scoped to the current user.
    expect(mockUserLibraryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { col: "userId", val: "user_123" },
      }),
    );
  });

  it("sorts by savedAt asc when direction is asc", async () => {
    const { getUserLibrary } = await importLibrary();
    const result = await getUserLibrary("savedAt", "asc");
    expect(result.items.map((i) => i.id)).toEqual([3, 1, 2]);
  });

  it("sorts by rating desc with null ratings last", async () => {
    const { getUserLibrary } = await importLibrary();
    const result = await getUserLibrary("rating", "desc");
    // 5, 3, null → 2, 1, 3
    expect(result.items.map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it("sorts by rating asc with null ratings first", async () => {
    const { getUserLibrary } = await importLibrary();
    const result = await getUserLibrary("rating", "asc");
    expect(result.items.map((i) => i.id)).toEqual([3, 1, 2]);
  });

  it("sorts by publishDate desc treating missing dates as 0", async () => {
    const { getUserLibrary } = await importLibrary();
    const result = await getUserLibrary("publishDate", "desc");
    // 2026-01-15, 2025-12-01, undefined(0) → 2, 1, 3
    expect(result.items.map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it("handles two items with null rating consistently (covers a-side of `?? -1`)", async () => {
    mockUserLibraryFindMany.mockResolvedValue([itemA, itemC, itemD]);
    const { getUserLibrary } = await importLibrary();
    const result = await getUserLibrary("rating", "desc");
    // itemA has rating 3; itemC and itemD both have null. The two null-rated
    // items compare as equal on rating, so their relative order is whatever
    // Array#sort considers stable for the rating-equal pair.
    expect(result.items.map((i) => i.id).slice(0, 1)).toEqual([1]);
    expect(result.items.map((i) => i.id).sort()).toEqual([1, 3, 4]);
  });

  it("handles two items with missing publishDate (covers a-side of `?? 0`)", async () => {
    mockUserLibraryFindMany.mockResolvedValue([itemA, itemC, itemD]);
    const { getUserLibrary } = await importLibrary();
    const result = await getUserLibrary("publishDate", "desc");
    // itemA has 2025-12-01; itemC and itemD have undefined → both 0.
    expect(result.items[0].id).toBe(1);
  });

  it("sorts titles A-Z when called with direction='desc' (production quirk: title branch is not pre-flipped)", async () => {
    // Other sort keys compute (b - a) and rely on direction='asc' to flip.
    // localeCompare already returns positive when a > b, so passing 'desc'
    // here results in A→Z (Apple, Banana, Cherry → ids 2, 1, 3). This pins
    // the production behavior; flipping the asymmetry is a separate concern.
    const { getUserLibrary } = await importLibrary();
    const result = await getUserLibrary("title", "desc");
    expect(result.items.map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it("returns empty list and error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { getUserLibrary } = await importLibrary();
    const result = await getUserLibrary();
    expect(result.items).toEqual([]);
    expect(result.error).toMatch(/signed in/i);
    expect(mockUserLibraryFindMany).not.toHaveBeenCalled();
  });

  it("returns error when DB throws", async () => {
    mockUserLibraryFindMany.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getUserLibrary } = await importLibrary();
    const result = await getUserLibrary();
    expect(result.items).toEqual([]);
    expect(result.error).toBe("Failed to load library");
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── updateLibraryNotes ────────────────────────────────────────────────────
describe("updateLibraryNotes", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  afterEach(() => vi.restoreAllMocks());

  it("updates notes on happy path", async () => {
    mockEpisodesFindFirst.mockResolvedValue({ id: 42 });
    mockUserLibraryFindFirst.mockResolvedValue({ id: 1 });
    const { updateLibraryNotes } = await importLibrary();
    const result = await updateLibraryNotes("ep1", "my note");
    expect(result).toEqual({ success: true, message: "Notes updated" });
    expect(mockUpdateSet).toHaveBeenCalledWith({ notes: "my note" });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { updateLibraryNotes } = await importLibrary();
    const result = await updateLibraryNotes("ep1", "x");
    expect(result.success).toBe(false);
    expect(mockEpisodesFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'Episode not found' when episode missing", async () => {
    mockEpisodesFindFirst.mockResolvedValue(undefined);
    const { updateLibraryNotes } = await importLibrary();
    const result = await updateLibraryNotes("ep1", "x");
    expect(result).toEqual({ success: false, error: "Episode not found" });
  });

  it("returns 'Episode not in library' when entry missing", async () => {
    mockEpisodesFindFirst.mockResolvedValue({ id: 42 });
    mockUserLibraryFindFirst.mockResolvedValue(undefined);
    const { updateLibraryNotes } = await importLibrary();
    const result = await updateLibraryNotes("ep1", "x");
    expect(result).toEqual({ success: false, error: "Episode not in library" });
  });

  it(
    "returns generic error when DB throws",
    testDbError(mockEpisodesFindFirst, async () => {
      const { updateLibraryNotes } = await importLibrary();
      return updateLibraryNotes("ep1", "x");
    }),
  );
});

// ── addBookmark ───────────────────────────────────────────────────────────
describe("addBookmark", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  afterEach(() => vi.restoreAllMocks());

  it("adds bookmark with note on happy path", async () => {
    mockUserLibraryFindFirst.mockResolvedValue({ id: 1 });
    mockInsertReturning.mockReturnValueOnce([
      { id: 5, userLibraryId: 1, timestamp: 100, note: "hi" },
    ]);
    const { addBookmark } = await importLibrary();
    const result = await addBookmark(1, 100, "hi");
    expect(result.success).toBe(true);
    if (result.success) expect(result.bookmark).toMatchObject({ id: 5 });
    expect(mockInsertValues).toHaveBeenCalledWith({
      userLibraryId: 1,
      timestamp: 100,
      note: "hi",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
  });

  it("nulls the note when not provided", async () => {
    mockUserLibraryFindFirst.mockResolvedValue({ id: 1 });
    mockInsertReturning.mockReturnValueOnce([{ id: 5 }]);
    const { addBookmark } = await importLibrary();
    await addBookmark(1, 100);
    expect(mockInsertValues).toHaveBeenCalledWith({
      userLibraryId: 1,
      timestamp: 100,
      note: null,
    });
  });

  it("nulls an empty-string note (production uses `||`, not `??`)", async () => {
    mockUserLibraryFindFirst.mockResolvedValue({ id: 1 });
    mockInsertReturning.mockReturnValueOnce([{ id: 5 }]);
    const { addBookmark } = await importLibrary();
    await addBookmark(1, 100, "");
    expect(mockInsertValues).toHaveBeenCalledWith({
      userLibraryId: 1,
      timestamp: 100,
      note: null,
    });
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { addBookmark } = await importLibrary();
    const result = await addBookmark(1, 100);
    expect(result.success).toBe(false);
    expect(mockUserLibraryFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'Library entry not found' when entry missing", async () => {
    mockUserLibraryFindFirst.mockResolvedValue(undefined);
    const { addBookmark } = await importLibrary();
    const result = await addBookmark(1, 100);
    expect(result).toEqual({
      success: false,
      error: "Library entry not found",
    });
  });

  it(
    "returns generic error when DB throws",
    testDbError(mockUserLibraryFindFirst, async () => {
      const { addBookmark } = await importLibrary();
      return addBookmark(1, 100);
    }),
  );
});

// ── updateBookmark ────────────────────────────────────────────────────────
describe("updateBookmark", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  afterEach(() => vi.restoreAllMocks());

  it("updates bookmark note on happy path", async () => {
    mockBookmarksFindFirst.mockResolvedValue({
      id: 5,
      libraryEntry: { userId: "user_123" },
    });
    const { updateBookmark } = await importLibrary();
    const result = await updateBookmark(5, "edited");
    expect(result).toEqual({ success: true, message: "Bookmark updated" });
    expect(mockUpdateSet).toHaveBeenCalledWith({ note: "edited" });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { updateBookmark } = await importLibrary();
    const result = await updateBookmark(5, "x");
    expect(result.success).toBe(false);
    expect(mockBookmarksFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'Bookmark not found' when bookmark missing", async () => {
    mockBookmarksFindFirst.mockResolvedValue(undefined);
    const { updateBookmark } = await importLibrary();
    const result = await updateBookmark(5, "x");
    expect(result).toEqual({ success: false, error: "Bookmark not found" });
  });

  it("returns 'Bookmark not found' on ownership mismatch", async () => {
    mockBookmarksFindFirst.mockResolvedValue({
      id: 5,
      libraryEntry: { userId: "someone_else" },
    });
    const { updateBookmark } = await importLibrary();
    const result = await updateBookmark(5, "x");
    expect(result).toEqual({ success: false, error: "Bookmark not found" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it(
    "returns generic error when DB throws",
    testDbError(mockBookmarksFindFirst, async () => {
      const { updateBookmark } = await importLibrary();
      return updateBookmark(5, "x");
    }),
  );
});

// ── deleteBookmark ────────────────────────────────────────────────────────
describe("deleteBookmark", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  afterEach(() => vi.restoreAllMocks());

  it("deletes bookmark on happy path", async () => {
    mockBookmarksFindFirst.mockResolvedValue({
      id: 5,
      libraryEntry: { userId: "user_123" },
    });
    const { deleteBookmark } = await importLibrary();
    const result = await deleteBookmark(5);
    expect(result).toEqual({ success: true, message: "Bookmark deleted" });
    expect(mockDelete).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { deleteBookmark } = await importLibrary();
    const result = await deleteBookmark(5);
    expect(result.success).toBe(false);
  });

  it("returns 'Bookmark not found' when missing", async () => {
    mockBookmarksFindFirst.mockResolvedValue(undefined);
    const { deleteBookmark } = await importLibrary();
    const result = await deleteBookmark(5);
    expect(result.success).toBe(false);
  });

  it("returns 'Bookmark not found' on ownership mismatch", async () => {
    mockBookmarksFindFirst.mockResolvedValue({
      id: 5,
      libraryEntry: { userId: "someone_else" },
    });
    const { deleteBookmark } = await importLibrary();
    const result = await deleteBookmark(5);
    expect(result.success).toBe(false);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it(
    "returns generic error when DB throws",
    testDbError(mockBookmarksFindFirst, async () => {
      const { deleteBookmark } = await importLibrary();
      return deleteBookmark(5);
    }),
  );
});

// ── updateLibraryRating ───────────────────────────────────────────────────
describe("updateLibraryRating", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  afterEach(() => vi.restoreAllMocks());

  it("updates rating on happy path", async () => {
    mockEpisodesFindFirst.mockResolvedValue({ id: 42 });
    mockUserLibraryFindFirst.mockResolvedValue({ id: 1 });
    const { updateLibraryRating } = await importLibrary();
    const result = await updateLibraryRating("ep1", 4);
    expect(result).toEqual({ success: true, message: "Rating updated" });
    expect(mockUpdateSet).toHaveBeenCalledWith({ rating: 4 });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { updateLibraryRating } = await importLibrary();
    const result = await updateLibraryRating("ep1", 4);
    expect(result.success).toBe(false);
  });

  it.each([0, 6, -1, 10])("rejects out-of-range rating %i", async (rating) => {
    const { updateLibraryRating } = await importLibrary();
    const result = await updateLibraryRating("ep1", rating);
    expect(result).toEqual({
      success: false,
      error: "Rating must be between 1 and 5",
    });
    expect(mockEpisodesFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'Episode not found' when missing", async () => {
    mockEpisodesFindFirst.mockResolvedValue(undefined);
    const { updateLibraryRating } = await importLibrary();
    const result = await updateLibraryRating("ep1", 4);
    expect(result).toEqual({ success: false, error: "Episode not found" });
  });

  it("returns 'Episode not in library' when entry missing", async () => {
    mockEpisodesFindFirst.mockResolvedValue({ id: 42 });
    mockUserLibraryFindFirst.mockResolvedValue(undefined);
    const { updateLibraryRating } = await importLibrary();
    const result = await updateLibraryRating("ep1", 4);
    expect(result).toEqual({ success: false, error: "Episode not in library" });
  });

  it(
    "returns generic error when DB throws",
    testDbError(mockEpisodesFindFirst, async () => {
      const { updateLibraryRating } = await importLibrary();
      return updateLibraryRating("ep1", 4);
    }),
  );
});

// ── getEpisodeAverageRating ───────────────────────────────────────────────
describe("getEpisodeAverageRating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns rounded average and count on happy path", async () => {
    mockSelectWhere.mockReturnValue([
      { averageRating: "4.27", ratingCount: 7 },
    ]);
    const { getEpisodeAverageRating } = await importLibrary();
    const result = await getEpisodeAverageRating("ep1");
    expect(result).toEqual({
      averageRating: 4.3,
      ratingCount: 7,
      error: null,
    });
  });

  it("returns null average when no ratings exist", async () => {
    mockSelectWhere.mockReturnValue([{ averageRating: null, ratingCount: 0 }]);
    const { getEpisodeAverageRating } = await importLibrary();
    const result = await getEpisodeAverageRating("ep1");
    expect(result).toEqual({
      averageRating: null,
      ratingCount: 0,
      error: null,
    });
  });

  it("returns error when DB throws", async () => {
    mockSelectWhere.mockImplementation(() => {
      throw new Error("DB failure");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getEpisodeAverageRating } = await importLibrary();
    const result = await getEpisodeAverageRating("ep1");
    expect(result).toEqual({
      averageRating: null,
      ratingCount: 0,
      error: "Failed to load ratings",
    });
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── getLibraryEntryByEpisodeId ────────────────────────────────────────────
describe("getLibraryEntryByEpisodeId", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  afterEach(() => vi.restoreAllMocks());

  it("returns the first row when found", async () => {
    mockLimit.mockResolvedValue([{ libraryEntryId: 1, episodeId: 42 }]);
    const { getLibraryEntryByEpisodeId } = await importLibrary();
    const result = await getLibraryEntryByEpisodeId("ep1");
    expect(result).toEqual({ libraryEntryId: 1, episodeId: 42 });
  });

  it("returns null when query is empty", async () => {
    mockLimit.mockResolvedValue([]);
    const { getLibraryEntryByEpisodeId } = await importLibrary();
    expect(await getLibraryEntryByEpisodeId("ep1")).toBeNull();
  });

  it("returns null when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { getLibraryEntryByEpisodeId } = await importLibrary();
    expect(await getLibraryEntryByEpisodeId("ep1")).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns null when DB throws", async () => {
    mockLimit.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getLibraryEntryByEpisodeId } = await importLibrary();
    expect(await getLibraryEntryByEpisodeId("ep1")).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── getBookmarks ──────────────────────────────────────────────────────────
describe("getBookmarks", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  afterEach(() => vi.restoreAllMocks());

  it("returns bookmarks on happy path", async () => {
    mockUserLibraryFindFirst.mockResolvedValue({ id: 1 });
    const rows = [
      { id: 10, userLibraryId: 1, timestamp: 60, note: "first" },
      { id: 11, userLibraryId: 1, timestamp: 180, note: null },
    ];
    mockBookmarksFindMany.mockResolvedValue(rows);
    const { getBookmarks } = await importLibrary();
    const result = await getBookmarks(1);
    expect(result).toEqual({ bookmarks: rows, error: null });
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { getBookmarks } = await importLibrary();
    const result = await getBookmarks(1);
    expect(result).toEqual({
      bookmarks: [],
      error: "You must be signed in to view bookmarks",
    });
    expect(mockUserLibraryFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'Library entry not found' when entry missing", async () => {
    mockUserLibraryFindFirst.mockResolvedValue(undefined);
    const { getBookmarks } = await importLibrary();
    const result = await getBookmarks(1);
    expect(result).toEqual({
      bookmarks: [],
      error: "Library entry not found",
    });
  });

  it("returns error when DB throws", async () => {
    mockUserLibraryFindFirst.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getBookmarks } = await importLibrary();
    const result = await getBookmarks(1);
    expect(result).toEqual({
      bookmarks: [],
      error: "Failed to load bookmarks",
    });
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── revalidatePodcastPage ─────────────────────────────────────────────────
describe("revalidatePodcastPage", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists));
  afterEach(() => vi.restoreAllMocks());

  it("calls revalidatePath when authenticated", async () => {
    const { revalidatePodcastPage } = await importLibrary();
    await revalidatePodcastPage(123);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/podcast/123");
  });

  it("is a no-op when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { revalidatePodcastPage } = await importLibrary();
    await revalidatePodcastPage(123);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
