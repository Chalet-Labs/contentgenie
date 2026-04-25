import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDrizzleOrmMock,
  makeClerkAuthMock,
  makeUserHelpersMock,
} from "@/app/actions/__tests__/__fixtures";

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => makeClerkAuthMock(() => mockAuth()));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

// db.insert(...).values(...).returning()
const mockInsert = vi.fn();
const mockInsertValues = vi.fn();
const mockInsertReturning = vi.fn();

// db.select(...).from(...).leftJoin(...).where(...).groupBy(...).orderBy(...)
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockLeftJoin = vi.fn();
const mockSelectWhere = vi.fn();
const mockGroupBy = vi.fn();
const mockOrderBy = vi.fn();

// db.update(...).set(...).where(...) — returns thenable (for direct await)
// or has .returning()
const mockUpdate = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockUpdateReturning = vi.fn();

// db.delete(...).where(...)
const mockDelete = vi.fn();
const mockDeleteWhere = vi.fn();

// db.query.*.findFirst / findMany
const mockCollectionsFindFirst = vi.fn();
const mockUserLibraryFindFirst = vi.fn();
const mockUserLibraryFindMany = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockInsertValues(...vArgs);
          return { returning: () => mockInsertReturning() };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            leftJoin: (...jArgs: unknown[]) => {
              mockLeftJoin(...jArgs);
              return {
                where: (...wArgs: unknown[]) => {
                  mockSelectWhere(...wArgs);
                  return {
                    groupBy: (...gArgs: unknown[]) => {
                      mockGroupBy(...gArgs);
                      return {
                        orderBy: (...oArgs: unknown[]) => mockOrderBy(...oArgs),
                      };
                    },
                  };
                },
              };
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
                returning: () => mockUpdateReturning(),
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
      collections: {
        findFirst: (...args: unknown[]) => mockCollectionsFindFirst(...args),
      },
      userLibrary: {
        findFirst: (...args: unknown[]) => mockUserLibraryFindFirst(...args),
        findMany: (...args: unknown[]) => mockUserLibraryFindMany(...args),
      },
    },
  },
}));

const mockEnsureUserExists = vi.fn();
vi.mock("@/db/helpers", () =>
  makeUserHelpersMock((...args: unknown[]) => mockEnsureUserExists(...args)),
);

vi.mock("@/db/library-columns", () => ({
  LIBRARY_ENTRY_COLUMNS: {},
  EPISODE_LIST_COLUMNS: {},
  PODCAST_LIST_COLUMNS: {},
  COLLECTION_LIST_COLUMNS: {},
}));

vi.mock("@/db/schema", () => ({
  collections: {
    id: "id",
    userId: "userId",
    name: "name",
    description: "description",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  userLibrary: {
    id: "id",
    userId: "userId",
    episodeId: "episodeId",
    savedAt: "savedAt",
    collectionId: "collectionId",
  },
}));

vi.mock("drizzle-orm", () => ({
  ...createDrizzleOrmMock(),
  and: vi.fn((...conds: unknown[]) => ({ _and: conds })),
  desc: vi.fn((col: unknown) => ({ col, direction: "desc" })),
  count: vi.fn((col: unknown) => ({
    _count: col,
    mapWith: vi.fn().mockReturnThis(),
  })),
  getTableColumns: vi.fn(() => ({})),
}));

const importCollections = async () => import("@/app/actions/collections");

// File-level reset so queued .mockReturnValueOnce / .mockImplementation values
// from one describe block don't leak into the next.
beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_1" });
  mockEnsureUserExists.mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

// ── createCollection ──────────────────────────────────────────────────────
describe("createCollection", () => {
  it("creates collection on happy path", async () => {
    const newRow = {
      id: 1,
      userId: "user_1",
      name: "My Collection",
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockInsertReturning.mockReturnValueOnce([newRow]);
    const { createCollection } = await importCollections();
    const result = await createCollection("My Collection");
    expect(result.success).toBe(true);
    if (result.success) expect(result.collection).toEqual(newRow);
    expect(mockInsertValues).toHaveBeenCalledWith({
      userId: "user_1",
      name: "My Collection",
      description: null,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
  });

  it("trims whitespace from name and description", async () => {
    mockInsertReturning.mockReturnValueOnce([{ id: 1 }]);
    const { createCollection } = await importCollections();
    await createCollection("  Trimmed  ", "  desc  ");
    expect(mockInsertValues).toHaveBeenCalledWith({
      userId: "user_1",
      name: "Trimmed",
      description: "desc",
    });
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { createCollection } = await importCollections();
    const result = await createCollection("X");
    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects empty name", async () => {
    const { createCollection } = await importCollections();
    const result = await createCollection("");
    expect(result).toEqual({
      success: false,
      error: "Collection name is required",
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only name", async () => {
    const { createCollection } = await importCollections();
    const result = await createCollection("   ");
    expect(result.success).toBe(false);
  });

  it("returns generic error when DB throws", async () => {
    mockInsertReturning.mockImplementation(() => {
      throw new Error("DB failure");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createCollection } = await importCollections();
    const result = await createCollection("X");
    expect(result).toEqual({
      success: false,
      error: "Failed to create collection. Please try again.",
    });
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── updateCollection ──────────────────────────────────────────────────────
describe("updateCollection", () => {
  it("updates collection on happy path", async () => {
    const updated = {
      id: 5,
      userId: "user_1",
      name: "Renamed",
      description: "new desc",
    };
    mockCollectionsFindFirst.mockResolvedValue({ id: 5, userId: "user_1" });
    mockUpdateReturning.mockReturnValueOnce([updated]);
    const { updateCollection } = await importCollections();
    const result = await updateCollection(5, "Renamed", "new desc");
    expect(result.success).toBe(true);
    if (result.success) expect(result.collection).toEqual(updated);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Renamed",
        description: "new desc",
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library/collection/5");
  });

  it("nulls description when omitted", async () => {
    mockCollectionsFindFirst.mockResolvedValue({ id: 5 });
    mockUpdateReturning.mockReturnValueOnce([{ id: 5 }]);
    const { updateCollection } = await importCollections();
    await updateCollection(5, "Renamed");
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { updateCollection } = await importCollections();
    const result = await updateCollection(5, "X");
    expect(result.success).toBe(false);
    expect(mockCollectionsFindFirst).not.toHaveBeenCalled();
  });

  it("rejects empty name", async () => {
    const { updateCollection } = await importCollections();
    const result = await updateCollection(5, "");
    expect(result.success).toBe(false);
    expect(mockCollectionsFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'Collection not found' when missing", async () => {
    mockCollectionsFindFirst.mockResolvedValue(undefined);
    const { updateCollection } = await importCollections();
    const result = await updateCollection(5, "X");
    expect(result).toEqual({ success: false, error: "Collection not found" });
  });

  it("returns generic error when DB throws", async () => {
    mockCollectionsFindFirst.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { updateCollection } = await importCollections();
    const result = await updateCollection(5, "X");
    expect(result.success).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── deleteCollection ──────────────────────────────────────────────────────
describe("deleteCollection", () => {
  it("nullifies library FKs and deletes collection on happy path", async () => {
    mockCollectionsFindFirst.mockResolvedValue({ id: 5, userId: "user_1" });
    const { deleteCollection } = await importCollections();
    const result = await deleteCollection(5);
    expect(result).toEqual({ success: true, message: "Collection deleted" });
    expect(mockUpdateSet).toHaveBeenCalledWith({ collectionId: null });
    expect(mockDelete).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { deleteCollection } = await importCollections();
    const result = await deleteCollection(5);
    expect(result.success).toBe(false);
  });

  it("returns 'Collection not found' when missing", async () => {
    mockCollectionsFindFirst.mockResolvedValue(undefined);
    const { deleteCollection } = await importCollections();
    const result = await deleteCollection(5);
    expect(result).toEqual({ success: false, error: "Collection not found" });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns generic error when DB throws", async () => {
    mockCollectionsFindFirst.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deleteCollection } = await importCollections();
    const result = await deleteCollection(5);
    expect(result.success).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── getUserCollections ────────────────────────────────────────────────────
describe("getUserCollections", () => {
  it("returns collections with episode counts via single query", async () => {
    const mockData = [
      { id: 1, name: "C1", episodeCount: 5 },
      { id: 2, name: "C2", episodeCount: 0 },
    ];
    mockOrderBy.mockResolvedValue(mockData);
    const { getUserCollections } = await importCollections();
    const result = await getUserCollections();
    expect(result.collections).toHaveLength(2);
    expect(result.error).toBeNull();
    expect(mockSelect).toHaveBeenCalled();
    expect(mockLeftJoin).toHaveBeenCalled();
    expect(mockGroupBy).toHaveBeenCalled();
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { getUserCollections } = await importCollections();
    const result = await getUserCollections();
    expect(result.collections).toEqual([]);
    expect(result.error).toMatch(/signed in/i);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns error when DB throws", async () => {
    mockOrderBy.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getUserCollections } = await importCollections();
    const result = await getUserCollections();
    expect(result).toEqual({
      collections: [],
      error: "Failed to load collections",
    });
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── getCollection ─────────────────────────────────────────────────────────
describe("getCollection", () => {
  it("returns collection and items on happy path", async () => {
    const collection = {
      id: 5,
      userId: "user_1",
      name: "C",
      description: null,
    };
    const items = [
      { id: 1, episodeId: 10, savedAt: new Date(), episode: {}, collection },
    ];
    mockCollectionsFindFirst.mockResolvedValue(collection);
    mockUserLibraryFindMany.mockResolvedValue(items);
    const { getCollection } = await importCollections();
    const result = await getCollection(5);
    expect(result.collection).toEqual(collection);
    expect(result.items).toHaveLength(1);
    expect(result.error).toBeNull();
  });

  it("returns null collection when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { getCollection } = await importCollections();
    const result = await getCollection(5);
    expect(result.collection).toBeNull();
    expect(result.items).toEqual([]);
    expect(result.error).toMatch(/signed in/i);
  });

  it("returns 'Collection not found' when missing", async () => {
    mockCollectionsFindFirst.mockResolvedValue(undefined);
    const { getCollection } = await importCollections();
    const result = await getCollection(5);
    expect(result).toEqual({
      collection: null,
      items: [],
      error: "Collection not found",
    });
    expect(mockUserLibraryFindMany).not.toHaveBeenCalled();
  });

  it("returns error when DB throws", async () => {
    mockCollectionsFindFirst.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getCollection } = await importCollections();
    const result = await getCollection(5);
    expect(result.collection).toBeNull();
    expect(result.error).toBe("Failed to load collection");
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── moveEpisodeToCollection ───────────────────────────────────────────────
describe("moveEpisodeToCollection", () => {
  it("moves entry to collection on happy path", async () => {
    mockUserLibraryFindFirst.mockResolvedValue({ id: 1, userId: "user_1" });
    mockCollectionsFindFirst.mockResolvedValue({ id: 5, userId: "user_1" });
    const { moveEpisodeToCollection } = await importCollections();
    const result = await moveEpisodeToCollection(1, 5);
    expect(result).toEqual({
      success: true,
      message: "Episode moved to collection",
    });
    expect(mockUpdateSet).toHaveBeenCalledWith({ collectionId: 5 });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library/collection/5");
  });

  it("removes from collection when collectionId is null", async () => {
    mockUserLibraryFindFirst.mockResolvedValue({ id: 1, userId: "user_1" });
    const { moveEpisodeToCollection } = await importCollections();
    const result = await moveEpisodeToCollection(1, null);
    expect(result).toEqual({
      success: true,
      message: "Episode removed from collection",
    });
    expect(mockUpdateSet).toHaveBeenCalledWith({ collectionId: null });
    expect(mockCollectionsFindFirst).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/library");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
  });

  it("returns error when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { moveEpisodeToCollection } = await importCollections();
    const result = await moveEpisodeToCollection(1, 5);
    expect(result.success).toBe(false);
    expect(mockUserLibraryFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'Library entry not found' when entry missing", async () => {
    mockUserLibraryFindFirst.mockResolvedValue(undefined);
    const { moveEpisodeToCollection } = await importCollections();
    const result = await moveEpisodeToCollection(1, 5);
    expect(result).toEqual({
      success: false,
      error: "Library entry not found",
    });
  });

  it("returns 'Collection not found' when target missing", async () => {
    mockUserLibraryFindFirst.mockResolvedValue({ id: 1, userId: "user_1" });
    mockCollectionsFindFirst.mockResolvedValue(undefined);
    const { moveEpisodeToCollection } = await importCollections();
    const result = await moveEpisodeToCollection(1, 5);
    expect(result).toEqual({
      success: false,
      error: "Collection not found",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns generic error when DB throws", async () => {
    mockUserLibraryFindFirst.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { moveEpisodeToCollection } = await importCollections();
    const result = await moveEpisodeToCollection(1, 5);
    expect(result.success).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
