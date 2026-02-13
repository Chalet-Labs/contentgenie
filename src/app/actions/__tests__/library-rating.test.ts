import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database
const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  episodes: { id: "id", podcastIndexId: "podcast_index_id" },
  userLibrary: { id: "id", episodeId: "episode_id", rating: "rating" },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNotNull: vi.fn(),
  avg: vi.fn(),
  count: vi.fn(),
}));

function mockQueryChain(resolvedValue: unknown[]) {
  const mockWhere = vi.fn().mockResolvedValue(resolvedValue);
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  mockSelect.mockReturnValue({ from: mockFrom });
}

describe("getEpisodeAverageRating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates average correctly from multiple ratings using SQL aggregate mock", async () => {
    mockQueryChain([{ averageRating: "4.0", ratingCount: 3 }]);

    const { getEpisodeAverageRating } = await import("@/app/actions/library");
    const result = await getEpisodeAverageRating("ep123");

    expect(result.averageRating).toBe(4.0);
    expect(result.ratingCount).toBe(3);
    expect(result.error).toBeNull();
  });

  it("handles no ratings correctly with SQL aggregate mock", async () => {
    mockQueryChain([]);

    const { getEpisodeAverageRating } = await import("@/app/actions/library");
    const result = await getEpisodeAverageRating("ep123");

    expect(result.averageRating).toBeNull();
    expect(result.ratingCount).toBe(0);
    expect(result.error).toBeNull();
  });

  it("handles episode not found", async () => {
    mockQueryChain([]);

    const { getEpisodeAverageRating } = await import("@/app/actions/library");
    const result = await getEpisodeAverageRating("nonexistent");

    expect(result.averageRating).toBeNull();
    expect(result.ratingCount).toBe(0);
    expect(result.error).toBeNull();
  });
});
