import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/db/schema", () => ({
  episodes: { podcastIndexId: "podcastIndexId", id: "id" },
  userLibrary: { userId: "userId", episodeId: "episodeId" },
}));

const mockEpisodesFindFirst = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      episodes: {
        findFirst: (...args: unknown[]) => mockEpisodesFindFirst(...args),
      },
    },
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/library/unsave", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/library/unsave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockEpisodesFindFirst.mockResolvedValue({ id: 42 });
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { POST } = await import("@/app/api/library/unsave/route");
    const response = await POST(makeRequest({ podcastIndexId: "ep-123" }));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 400 for missing podcastIndexId", async () => {
    const { POST } = await import("@/app/api/library/unsave/route");
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 400 for non-string podcastIndexId", async () => {
    const { POST } = await import("@/app/api/library/unsave/route");
    const response = await POST(makeRequest({ podcastIndexId: 123 }));

    expect(response.status).toBe(400);
  });

  it("returns 400 for non-object body", async () => {
    const { POST } = await import("@/app/api/library/unsave/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/library/unsave", {
        method: "POST",
        body: "not-json",
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when episode not found", async () => {
    mockEpisodesFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/library/unsave/route");
    const response = await POST(makeRequest({ podcastIndexId: "ep-nonexistent" }));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 200 with success:true on valid removal", async () => {
    const { POST } = await import("@/app/api/library/unsave/route");
    const response = await POST(makeRequest({ podcastIndexId: "ep-123" }));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it("calls db.delete", async () => {
    const { POST } = await import("@/app/api/library/unsave/route");
    await POST(makeRequest({ podcastIndexId: "ep-123" }));

    expect(mockDelete).toHaveBeenCalled();
  });

  it("returns 500 on DB error without leaking details", async () => {
    mockEpisodesFindFirst.mockRejectedValue(new Error("DB connection failed"));

    const { POST } = await import("@/app/api/library/unsave/route");
    const response = await POST(makeRequest({ podcastIndexId: "ep-123" }));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(JSON.stringify(data)).not.toContain("DB connection failed");
  });
});
