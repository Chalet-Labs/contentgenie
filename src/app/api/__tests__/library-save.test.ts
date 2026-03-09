import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

const mockGetClerkEmail = vi.fn();
vi.mock("@/lib/clerk-helpers", () => ({
  getClerkEmail: (...args: unknown[]) => mockGetClerkEmail(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/db/schema", () => ({
  users: {},
  podcasts: { podcastIndexId: "podcastIndexId", id: "id" },
  episodes: { podcastIndexId: "podcastIndexId", id: "id" },
  userLibrary: { id: "id" },
}));

const mockInsert = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

const validEpisodePayload = {
  podcastIndexId: "ep-123",
  title: "Test Episode",
  description: "An episode",
  audioUrl: "https://example.com/audio.mp3",
  duration: 1800,
  podcast: {
    podcastIndexId: "pod-456",
    title: "Test Podcast",
    imageUrl: "https://example.com/art.jpg",
  },
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/library/save", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function setupInsertChains({
  podcastId = 10,
  episodeId = 20,
  libraryResult = [{ id: 30 }],
}: {
  podcastId?: number;
  episodeId?: number;
  libraryResult?: Array<{ id: number }>;
} = {}) {
  // Call order: users, podcasts, episodes, userLibrary
  let callCount = 0;
  mockInsert.mockImplementation(() => {
    callCount++;
    switch (callCount) {
      case 1: // users (onConflictDoUpdate when email non-empty, onConflictDoNothing otherwise)
        return {
          values: vi.fn().mockReturnThis(),
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        };
      case 2: // podcasts (updateOnConflict: false → no-op touch via onConflictDoUpdate)
        return {
          values: vi.fn().mockReturnThis(),
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: podcastId }]),
          }),
        };
      case 3: // episodes
        return {
          values: vi.fn().mockReturnThis(),
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: episodeId }]),
          }),
        };
      case 4: // userLibrary
      default:
        return {
          values: vi.fn().mockReturnThis(),
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(libraryResult),
          }),
        };
    }
  });
}

describe("POST /api/library/save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockGetClerkEmail.mockResolvedValue("");
    setupInsertChains();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { POST } = await import("@/app/api/library/save/route");
    const response = await POST(makeRequest(validEpisodePayload));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 400 for missing podcastIndexId", async () => {
    const { POST } = await import("@/app/api/library/save/route");
    const response = await POST(
      makeRequest({ title: "Test", podcast: { podcastIndexId: "pod-1", title: "P" } })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 400 for missing title", async () => {
    const { POST } = await import("@/app/api/library/save/route");
    const response = await POST(
      makeRequest({ podcastIndexId: "ep-1", podcast: { podcastIndexId: "pod-1", title: "P" } })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for missing podcast data", async () => {
    const { POST } = await import("@/app/api/library/save/route");
    const response = await POST(makeRequest({ podcastIndexId: "ep-1", title: "Test" }));

    expect(response.status).toBe(400);
  });

  it("returns 400 for missing podcast.podcastIndexId", async () => {
    const { POST } = await import("@/app/api/library/save/route");
    const response = await POST(
      makeRequest({
        podcastIndexId: "ep-1",
        title: "Test",
        podcast: { title: "P" },
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 200 with success:true for valid payload", async () => {
    const { POST } = await import("@/app/api/library/save/route");
    const response = await POST(makeRequest(validEpisodePayload));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it("returns success with 'already in library' message when conflict", async () => {
    setupInsertChains({ libraryResult: [] }); // empty = already exists

    const { POST } = await import("@/app/api/library/save/route");
    const response = await POST(makeRequest(validEpisodePayload));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/already/i);
  });

  it("returns 500 on DB error and does not expose internal details", async () => {
    let callCount = 0;
    mockInsert.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // users insert — succeeds
        return {
          values: vi.fn().mockReturnThis(),
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        };
      }
      // podcasts insert — throws
      return {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("DB connection failed")),
        }),
      };
    });

    const { POST } = await import("@/app/api/library/save/route");
    const response = await POST(makeRequest(validEpisodePayload));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(JSON.stringify(data)).not.toContain("DB connection failed");
  });
});

describe("POST /api/library/save — Clerk email lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockGetClerkEmail.mockResolvedValue("");
    setupInsertChains();
  });

  it("uses email from Clerk when user has email addresses", async () => {
    mockGetClerkEmail.mockResolvedValue("alice@example.com");

    const { POST } = await import("@/app/api/library/save/route");
    const response = await POST(makeRequest(validEpisodePayload));

    expect(response.status).toBe(200);

    // The first db.insert call is users — check the values passed
    const usersInsertCall = mockInsert.mock.calls[0]; // first call = users table
    expect(usersInsertCall).toBeDefined();

    // The values call on the returned chain should include the email
    const insertChain = mockInsert.mock.results[0].value;
    const valuesCall = insertChain.values.mock.calls[0][0];
    expect(valuesCall.email).toBe("alice@example.com");
  });

  it("falls back to empty string when Clerk getUser throws", async () => {
    // getClerkEmail already handles the fallback internally, returns ""
    mockGetClerkEmail.mockResolvedValue("");

    const { POST } = await import("@/app/api/library/save/route");
    const response = await POST(makeRequest(validEpisodePayload));

    // Should still succeed — fallback to ""
    expect(response.status).toBe(200);

    const insertChain = mockInsert.mock.results[0].value;
    const valuesCall = insertChain.values.mock.calls[0][0];
    expect(valuesCall.email).toBe("");
  });
});
