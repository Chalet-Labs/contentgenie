import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserCollections } from "../collections";
import { db } from "@/db";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "user_1" }),
}));

// Mock the database
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockLeftJoin = vi.fn();
const mockWhere = vi.fn();
const mockGroupBy = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

describe("getUserCollections", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup the mock chain
    (db.select as any).mockReturnValue({
      from: mockFrom.mockReturnValue({
        leftJoin: mockLeftJoin.mockReturnValue({
          where: mockWhere.mockReturnValue({
            groupBy: mockGroupBy.mockReturnValue({
              orderBy: mockOrderBy,
            }),
          }),
        }),
      }),
    });
  });

  it("returns collections with episode counts in a single query", async () => {
    const mockData = [
      {
        id: 1,
        name: "Collection 1",
        episodeCount: 5,
      },
      {
        id: 2,
        name: "Collection 2",
        episodeCount: 0,
      },
    ];

    mockOrderBy.mockResolvedValue(mockData);

    const result = await getUserCollections();

    expect(result.collections).toHaveLength(2);
    expect(result.collections[0].episodeCount).toBe(5);
    expect(result.collections[1].episodeCount).toBe(0);

    // Verify the chain was called
    expect(db.select).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLeftJoin).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockGroupBy).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalled();
  });

  it("returns an error if the user is not signed in", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    (auth as any).mockResolvedValueOnce({ userId: null });

    const result = await getUserCollections();

    expect(result.collections).toHaveLength(0);
    expect(result.error).toBe("You must be signed in to view collections");
  });
});
