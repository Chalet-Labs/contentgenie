import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { POST } from "@/app/api/episodes/batch-summarize/route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      episodes: { findMany: vi.fn() },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: { podcastIndexId: "podcastIndexId" },
}));

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn(),
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: {
    trigger: vi.fn().mockResolvedValue({ id: "run_batch123" }),
  },
  auth: {
    createPublicToken: vi.fn().mockResolvedValue("test-public-token"),
  },
}));

vi.mock("@/trigger/batch-summarize-episodes", () => ({}));

function makeRequest(body: unknown) {
  return new NextRequest(
    "http://localhost:3000/api/episodes/batch-summarize",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/episodes/batch-summarize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const response = await POST(makeRequest({ episodeIds: [1, 2] }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when episodeIds is missing", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const response = await POST(makeRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("episodeIds must be a non-empty array");
  });

  it("returns 400 when episodeIds is empty", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const response = await POST(makeRequest({ episodeIds: [] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("episodeIds must be a non-empty array");
  });

  it("returns 400 when episodeIds is not an array", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const response = await POST(makeRequest({ episodeIds: "123" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("episodeIds must be a non-empty array");
  });

  it("returns 400 when episodeIds exceeds maximum of 20", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const ids = Array.from({ length: 21 }, (_, i) => i + 1);
    const response = await POST(makeRequest({ episodeIds: ids }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Maximum 20 episodes per batch");
  });

  it("returns 400 when episodeIds contains invalid values", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const response = await POST(makeRequest({ episodeIds: [1, -2, 3] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("All episode IDs must be positive numbers");
  });

  it("returns 400 when episodeIds contains non-numbers", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const response = await POST(makeRequest({ episodeIds: [1, "abc", 3] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("All episode IDs must be positive numbers");
  });

  it("returns cached response when all episodes already processed", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    vi.mocked(db.query.episodes.findMany).mockResolvedValue([
      { podcastIndexId: "1", processedAt: new Date() },
      { podcastIndexId: "2", processedAt: new Date() },
    ] as never);

    const response = await POST(makeRequest({ episodeIds: [1, 2] }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alreadyCached).toBe(true);
    expect(data.total).toBe(2);
    expect(data.skipped).toBe(2);
  });

  it("returns 202 with run handle when triggering batch summarization", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    vi.mocked(db.query.episodes.findMany).mockResolvedValue([] as never);

    const { tasks } = await import("@trigger.dev/sdk");

    const response = await POST(makeRequest({ episodeIds: [1, 2, 3] }));
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.runId).toBe("run_batch123");
    expect(data.publicAccessToken).toBe("test-public-token");
    expect(data.total).toBe(3);
    expect(data.skipped).toBe(0);
    expect(tasks.trigger).toHaveBeenCalledWith(
      "batch-summarize-episodes",
      { episodeIds: [1, 2, 3] }
    );
  });

  it("returns 202 with correct skipped count for partial cache", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    vi.mocked(db.query.episodes.findMany).mockResolvedValue([
      { podcastIndexId: "1", processedAt: new Date() },
      { podcastIndexId: "3", processedAt: null },
    ] as never);

    const response = await POST(makeRequest({ episodeIds: [1, 2, 3] }));
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.total).toBe(3);
    expect(data.skipped).toBe(1);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "rate-limit-user" } as never);
    vi.mocked(db.query.episodes.findMany).mockResolvedValue([] as never);

    // Exhaust rate limit (10 max per hour) with a single batch of 10
    const firstResponse = await POST(
      makeRequest({ episodeIds: Array.from({ length: 10 }, (_, i) => i + 1) })
    );
    expect(firstResponse.status).toBe(202);

    // Next request should be rate-limited
    const response = await POST(makeRequest({ episodeIds: [100] }));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("accepts exactly 20 episodes (the maximum)", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-max" } as never);
    vi.mocked(db.query.episodes.findMany).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        podcastIndexId: String(i + 1),
        processedAt: new Date(),
      })) as never
    );

    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const response = await POST(makeRequest({ episodeIds: ids }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alreadyCached).toBe(true);
    expect(data.total).toBe(20);
  });

  it("returns 500 when an unexpected error occurs", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    vi.mocked(db.query.episodes.findMany).mockRejectedValue(
      new Error("DB connection failed")
    );

    const response = await POST(makeRequest({ episodeIds: [1] }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to trigger batch summarization");
    expect(data.details).toBe("DB connection failed");
  });
});
