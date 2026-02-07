import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { POST, GET } from "@/app/api/episodes/summarize/route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      episodes: { findFirst: vi.fn() },
      podcasts: { findFirst: vi.fn() },
    },
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: { podcastIndexId: "podcastIndexId", id: "id" },
  podcasts: { podcastIndexId: "podcastIndexId" },
}));

vi.mock("@/lib/podcastindex", () => ({
  getEpisodeById: vi.fn(),
  getPodcastById: vi.fn(),
}));

vi.mock("@/lib/openrouter", () => ({
  generateCompletion: vi.fn(),
  parseJsonResponse: vi.fn(),
}));

vi.mock("@/lib/prompts", () => ({
  SYSTEM_PROMPT: "system prompt",
  getSummarizationPrompt: vi.fn().mockReturnValue("prompt"),
}));

describe("POST /api/episodes/summarize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/summarize",
      {
        method: "POST",
        body: JSON.stringify({ episodeId: "123" }),
      }
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when episodeId is missing", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/summarize",
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Episode ID is required");
  });

  it("returns cached summary when exists", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    vi.mocked(db.query.episodes.findFirst).mockResolvedValue({
      summary: "Cached summary",
      keyTakeaways: ["Point 1"],
      worthItScore: "8.00",
      processedAt: new Date(),
    } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/summarize",
      {
        method: "POST",
        body: JSON.stringify({ episodeId: "123" }),
      }
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cached).toBe(true);
    expect(data.summary).toBe("Cached summary");
    expect(data.worthItScore).toBe(8);
  });
});

describe("GET /api/episodes/summarize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/summarize?episodeId=123"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns existing summary status", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    vi.mocked(db.query.episodes.findFirst).mockResolvedValue({
      summary: "Summary text",
      keyTakeaways: ["Takeaway"],
      worthItScore: "7.00",
      processedAt: new Date("2024-01-15"),
    } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/summarize?episodeId=123"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exists).toBe(true);
    expect(data.summary).toBe("Summary text");
  });

  it("returns exists=false when no summary", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    vi.mocked(db.query.episodes.findFirst).mockResolvedValue(null as never);

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/summarize?episodeId=123"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exists).toBe(false);
  });
});
