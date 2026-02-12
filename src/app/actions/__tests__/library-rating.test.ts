import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock database
const mockFindFirstEpisode = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      episodes: { findFirst: (...args: unknown[]) => mockFindFirstEpisode(...args) },
    },
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

// Mock schema — include all exports used by library.ts
vi.mock("@/db/schema", () => ({
  episodes: { id: "id", podcastIndexId: "podcast_index_id" },
  userLibrary: { id: "id", episodeId: "episode_id", rating: "rating" },
  users: {},
  podcasts: {},
  bookmarks: {},
}));

// Mock drizzle-orm — include all imports used by library.ts
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
  isNotNull: vi.fn(),
  avg: vi.fn(),
  count: vi.fn(),
}));

describe("getEpisodeAverageRating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("calculates average correctly from multiple ratings using SQL aggregate mock", async () => {
    mockFindFirstEpisode.mockResolvedValue({ id: 1 });

    // Mock the chain: db.select().from().where()
    const mockWhere = vi.fn().mockResolvedValue([{ avgRating: "4.0", totalCount: 3 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const { getEpisodeAverageRating } = await import("@/app/actions/library");
    const result = await getEpisodeAverageRating("ep123");

    expect(result.averageRating).toBe(4.0);
    expect(result.ratingCount).toBe(3);
    expect(result.error).toBeNull();
  });

  it("handles no ratings correctly with SQL aggregate mock", async () => {
    mockFindFirstEpisode.mockResolvedValue({ id: 1 });

    const mockWhere = vi.fn().mockResolvedValue([{ avgRating: null, totalCount: 0 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const { getEpisodeAverageRating } = await import("@/app/actions/library");
    const result = await getEpisodeAverageRating("ep123");

    expect(result.averageRating).toBeNull();
    expect(result.ratingCount).toBe(0);
  });

  it("handles episode not found", async () => {
    mockFindFirstEpisode.mockResolvedValue(null);

    const { getEpisodeAverageRating } = await import("@/app/actions/library");
    const result = await getEpisodeAverageRating("nonexistent");

    expect(result.averageRating).toBeNull();
    expect(result.ratingCount).toBe(0);
  });
});
