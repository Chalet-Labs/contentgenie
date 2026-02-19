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
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();
const mockOnConflictDoUpdate = vi.fn();
const mockReturning = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      podcasts: { findFirst: vi.fn() },
      episodes: { findFirst: vi.fn() },
      userLibrary: { findFirst: vi.fn() },
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          const chain = {
            onConflictDoNothing: () => {
              mockOnConflictDoNothing();
              return {
                returning: () => {
                  mockReturning();
                  return mockReturning();
                },
              };
            },
            onConflictDoUpdate: () => {
              mockOnConflictDoUpdate();
              return {
                returning: () => {
                  mockReturning();
                  return mockReturning();
                },
              };
            },
            returning: () => {
              mockReturning();
              return mockReturning();
            },
          };
          return chain;
        },
      };
    },
  },
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  users: { id: "id" },
  podcasts: { id: "id", podcastIndexId: "podcast_index_id" },
  episodes: { id: "id", podcastIndexId: "podcast_index_id" },
  userLibrary: { id: "id", episodeId: "episode_id", userId: "user_id" },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
  isNotNull: vi.fn(),
  avg: vi.fn(),
  count: vi.fn(),
}));

describe("saveEpisodeToLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("successfully saves a new episode to library", async () => {
    // 1. podcasts upsert -> calls 1-2 returns [{id: 10}]
    // 2. episodes upsert -> calls 3-4 returns [{id: 100}]
    // 3. library insert -> calls 5-6 returns [{id: 1000}]
    mockReturning
      .mockReturnValueOnce([{ id: 10 }])
      .mockReturnValueOnce([{ id: 10 }])
      .mockReturnValueOnce([{ id: 100 }])
      .mockReturnValueOnce([{ id: 100 }])
      .mockReturnValueOnce([{ id: 1000 }])
      .mockReturnValueOnce([{ id: 1000 }]);

    const { saveEpisodeToLibrary } = await import("@/app/actions/library");
    const result = await saveEpisodeToLibrary({
      podcastIndexId: "ep1",
      title: "Episode 1",
      podcast: {
        podcastIndexId: "pod1",
        title: "Podcast 1",
      },
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/saved to library/i);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(2); // podcast and episode
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(2); // user and library
  });

  it("handles already saved episode", async () => {
    // 1. podcasts upsert -> calls 1-2 returns [{id: 10}]
    // 2. episodes upsert -> calls 3-4 returns [{id: 100}]
    // 3. library insert (onConflictDoNothing) -> calls 5-6 returns []
    mockReturning
      .mockReturnValueOnce([{ id: 10 }])
      .mockReturnValueOnce([{ id: 10 }])
      .mockReturnValueOnce([{ id: 100 }])
      .mockReturnValueOnce([{ id: 100 }])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const { saveEpisodeToLibrary } = await import("@/app/actions/library");
    const result = await saveEpisodeToLibrary({
      podcastIndexId: "ep1",
      title: "Episode 1",
      podcast: {
        podcastIndexId: "pod1",
        title: "Podcast 1",
      },
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/already in library/i);
  });
});
