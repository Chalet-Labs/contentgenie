import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { getEpisodeById, getPodcastById } from "@/lib/podcastindex";
import { GET } from "@/app/api/episodes/[id]/route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      episodes: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: { podcastIndexId: "podcastIndexId" },
}));

vi.mock("@/lib/podcastindex", () => ({
  getEpisodeById: vi.fn(),
  getPodcastById: vi.fn(),
}));

describe("GET /api/episodes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/123");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 for non-numeric ID", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/abc");
    const response = await GET(request, { params: { id: "abc" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid episode ID");
  });

  it("returns 404 when episode not found", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    vi.mocked(getEpisodeById).mockResolvedValue({
      status: "true",
      episode: null as never,
      description: "",
    });

    const request = new NextRequest("http://localhost:3000/api/episodes/999");
    const response = await GET(request, { params: { id: "999" } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Episode not found");
  });

  it("returns 404 when PodcastIndex API throws an error", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    vi.mocked(getEpisodeById).mockRejectedValue(
      new Error("PodcastIndex API error: 400 Bad Request")
    );

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/49731529531"
    );
    const response = await GET(request, {
      params: { id: "49731529531" },
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Episode not found");
  });

  it("returns episode data without summary when DB query fails", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const mockEpisode = { id: 123, title: "Ep", feedId: 456 };
    const mockPodcast = { id: 456, title: "Pod" };

    vi.mocked(getEpisodeById).mockResolvedValue({
      status: "true",
      episode: mockEpisode as never,
      description: "",
    });
    vi.mocked(getPodcastById).mockResolvedValue({
      status: "true",
      feed: mockPodcast as never,
      description: "",
    });
    vi.mocked(db.query.episodes.findFirst).mockRejectedValue(
      new Error("DB connection failed")
    );

    const request = new NextRequest("http://localhost:3000/api/episodes/123");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.episode).toEqual(mockEpisode);
    expect(data.podcast).toEqual(mockPodcast);
    expect(data.summary).toBeNull();
  });

  it("returns episode data with podcast and cached summary", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const mockEpisode = { id: 123, title: "Ep", feedId: 456 };
    const mockPodcast = { id: 456, title: "Pod" };

    vi.mocked(getEpisodeById).mockResolvedValue({
      status: "true",
      episode: mockEpisode as never,
      description: "",
    });
    vi.mocked(getPodcastById).mockResolvedValue({
      status: "true",
      feed: mockPodcast as never,
      description: "",
    });

    vi.mocked(db.query.episodes.findFirst).mockResolvedValue({
      summary: "Cached summary",
      keyTakeaways: ["Point 1"],
      worthItScore: "7.50",
      processedAt: new Date(),
    } as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/123");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.episode).toEqual(mockEpisode);
    expect(data.podcast).toEqual(mockPodcast);
    expect(data.summary.summary).toBe("Cached summary");
    expect(data.summary.worthItScore).toBe(7.5);
  });
});
