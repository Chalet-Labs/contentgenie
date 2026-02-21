import { describe, it, expect, vi, beforeEach } from "vitest";

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
const mockReturning = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            onConflictDoNothing: () => {
              return {
                returning: () => {
                  mockReturning();
                  return mockReturning();
                },
              };
            },
            onConflictDoUpdate: () => {
              return {
                returning: () => {
                  mockReturning();
                  return mockReturning();
                },
              };
            },
            returning: () => mockReturning(),
          };
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
  userLibrary: { id: "id", userId: "user_id", episodeId: "episode_id" },
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
  const mockEpisodeData = {
    podcastIndexId: "ep_123",
    title: "Test Episode",
    podcast: {
      podcastIndexId: "pod_456",
      title: "Test Podcast",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockReturning.mockReturnValue([{ id: 1 }]);
  });

  it("successfully saves a new episode to library", async () => {
    const { saveEpisodeToLibrary } = await import("@/app/actions/library");
    const result = await saveEpisodeToLibrary(mockEpisodeData as any);

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/saved to library/i);
    expect(mockInsert).toHaveBeenCalledTimes(4); // users, podcasts, episodes, userLibrary
  });

  it("handles already saved episode", async () => {
    // mockReturning calls:
    // 1-2: podcasts returning
    // 3-4: episodes returning
    // 5-6: userLibrary returning (conflict)
    mockReturning
      .mockReturnValueOnce([{ id: 1 }])
      .mockReturnValueOnce([{ id: 1 }])
      .mockReturnValueOnce([{ id: 2 }])
      .mockReturnValueOnce([{ id: 2 }])
      .mockReturnValueOnce([]) // Conflict!
      .mockReturnValueOnce([]);

    const { saveEpisodeToLibrary } = await import("@/app/actions/library");
    const result = await saveEpisodeToLibrary(mockEpisodeData as any);

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/already in library/i);
  });
});
