import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { getEpisodeById, getPodcastById } from "@/lib/podcastindex";
import { GET } from "@/app/api/episodes/[id]/route";

const { mockPublicEpisodeRateLimit } = vi.hoisted(() => ({
  mockPublicEpisodeRateLimit: vi.fn(),
}));

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

vi.mock("@/lib/rate-limit", () => ({
  createRateLimitChecker: vi.fn(() => mockPublicEpisodeRateLimit),
}));

describe("GET /api/episodes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublicEpisodeRateLimit.mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("allows unauthenticated requests for numeric episode IDs", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

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
    vi.mocked(db.query.episodes.findFirst).mockResolvedValue(undefined as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/123");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.episode).toEqual(mockEpisode);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600"
    );
    expect(response.headers.get("vary")?.split(/,\s*/)).toContain("Cookie");
  });

  it("does not apply shared-cache headers to authenticated numeric episode requests", async () => {
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
    vi.mocked(db.query.episodes.findFirst).mockResolvedValue(undefined as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/123");
    const response = await GET(request, { params: { id: "123" } });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).not.toBe(
      "public, s-maxage=300, stale-while-revalidate=600"
    );
  });

  it("returns 400 for non-numeric ID", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/abc");
    const response = await GET(request, { params: { id: "abc" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid episode ID");
  });

  it("allows unauthenticated requests for RSS-sourced episode IDs", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    vi.mocked(db.query.episodes.findFirst).mockResolvedValue({
      id: 99,
      title: "RSS Ep",
      description: "desc",
      publishDate: new Date("2024-01-01"),
      audioUrl: "https://example.com/ep.mp3",
      duration: 3600,
      podcastId: 5,
      podcastIndexId: "rss-abc",
      rssGuid: "guid-123",
      transcriptSource: "podcastindex",
      transcriptStatus: "missing",
      summary: null,
      processedAt: null,
      keyTakeaways: [],
      worthItScore: null,
      worthItReason: null,
      worthItDimensions: null,
      podcast: {
        podcastIndexId: "rss-abc",
        title: "RSS Pod",
        publisher: "Author",
        imageUrl: "https://example.com/img.png",
      },
    } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/rss-abc"
    );
    const response = await GET(request, { params: { id: "rss-abc" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.episode.id).toBe("rss-abc");
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600"
    );
    expect(response.headers.get("vary")?.split(/,\s*/)).toContain("Cookie");
  });

  it("returns a generic 500 payload without internal error details", async () => {
    vi.mocked(auth).mockRejectedValue(new Error("Clerk exploded") as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/123");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: "Failed to fetch episode",
    });
  });

  it("does not apply shared-cache headers to authenticated RSS episode requests", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    vi.mocked(db.query.episodes.findFirst).mockResolvedValue({
      id: 99,
      title: "RSS Ep",
      description: "desc",
      publishDate: new Date("2024-01-01"),
      audioUrl: "https://example.com/ep.mp3",
      duration: 3600,
      podcastId: 5,
      podcastIndexId: "rss-abc",
      rssGuid: "guid-123",
      transcriptSource: "podcastindex",
      transcriptStatus: "missing",
      summary: null,
      processedAt: null,
      keyTakeaways: [],
      worthItScore: null,
      worthItReason: null,
      worthItDimensions: null,
      podcast: {
        podcastIndexId: "rss-abc",
        title: "RSS Pod",
        publisher: "Author",
        imageUrl: "https://example.com/img.png",
      },
    } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/rss-abc"
    );
    const response = await GET(request, { params: { id: "rss-abc" } });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).not.toBe(
      "public, s-maxage=300, stale-while-revalidate=600"
    );
  });

  it("returns 429 when anonymous requests exceed the public episode rate limit", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    mockPublicEpisodeRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterMs: 120000,
    });

    const request = new NextRequest("http://localhost:3000/api/episodes/123", {
      headers: {
        "x-forwarded-for": "203.0.113.9",
      },
    });
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toMatch(/rate limit/i);
    expect(data.retryAfterMs).toBe(120000);
  });

  it("uses the Vercel-forwarded client IP for anonymous rate limiting when present", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

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
    vi.mocked(db.query.episodes.findFirst).mockResolvedValue(undefined as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/123", {
      headers: {
        "x-forwarded-for": "203.0.113.9",
        "x-real-ip": "203.0.113.10",
        "x-vercel-forwarded-for": "198.51.100.24",
      },
    });
    const response = await GET(request, { params: { id: "123" } });

    expect(response.status).toBe(200);
    expect(mockPublicEpisodeRateLimit).toHaveBeenCalledWith("198.51.100.24");
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

  // --- transcriptStatus and episodeDbId extension tests ---

  it("PodcastIndex path: includes transcriptStatus and episodeDbId when DB row exists", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const mockEpisode = { id: 123, title: "Ep", feedId: 456 };
    vi.mocked(getEpisodeById).mockResolvedValue({
      status: "true",
      episode: mockEpisode as never,
      description: "",
    });
    vi.mocked(getPodcastById).mockResolvedValue({
      status: "true",
      feed: null as never,
      description: "",
    });
    vi.mocked(db.query.episodes.findFirst).mockResolvedValue({
      id: 42,
      transcriptStatus: "available",
      transcriptSource: "assemblyai",
      summary: null,
      processedAt: null,
    } as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/123");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transcriptStatus).toBe("available");
    expect(data.episodeDbId).toBe(42);
  });

  it("PodcastIndex path: episodeDbId is null when no DB row exists", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const mockEpisode = { id: 123, title: "Ep", feedId: 456 };
    vi.mocked(getEpisodeById).mockResolvedValue({
      status: "true",
      episode: mockEpisode as never,
      description: "",
    });
    vi.mocked(getPodcastById).mockResolvedValue({
      status: "true",
      feed: null as never,
      description: "",
    });
    vi.mocked(db.query.episodes.findFirst).mockResolvedValue(undefined as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/123");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transcriptStatus).toBeNull();
    expect(data.episodeDbId).toBeNull();
  });

  it("PodcastIndex path: transcriptStatus is null when DB row has no transcriptStatus", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    const mockEpisode = { id: 123, title: "Ep", feedId: 456 };
    vi.mocked(getEpisodeById).mockResolvedValue({
      status: "true",
      episode: mockEpisode as never,
      description: "",
    });
    vi.mocked(getPodcastById).mockResolvedValue({
      status: "true",
      feed: null as never,
      description: "",
    });
    vi.mocked(db.query.episodes.findFirst).mockResolvedValue({
      id: 7,
      transcriptStatus: null,
      transcriptSource: null,
      summary: null,
      processedAt: null,
    } as never);

    const request = new NextRequest("http://localhost:3000/api/episodes/123");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transcriptStatus).toBeNull();
    expect(data.episodeDbId).toBe(7);
  });

  it("RSS path: includes transcriptStatus and episodeDbId from DB row", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    vi.mocked(db.query.episodes.findFirst).mockResolvedValue({
      id: 99,
      title: "RSS Ep",
      description: "desc",
      publishDate: new Date("2024-01-01"),
      audioUrl: "https://example.com/ep.mp3",
      duration: 3600,
      podcastId: 5,
      podcastIndexId: "rss-abc",
      rssGuid: "guid-123",
      transcriptSource: "podcastindex",
      transcriptStatus: "missing",
      summary: null,
      processedAt: null,
      keyTakeaways: [],
      worthItScore: null,
      worthItReason: null,
      worthItDimensions: null,
      podcast: {
        podcastIndexId: "rss-abc",
        title: "RSS Pod",
        publisher: "Author",
        imageUrl: "https://example.com/img.png",
      },
    } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/rss-abc"
    );
    const response = await GET(request, { params: { id: "rss-abc" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transcriptStatus).toBe("missing");
    expect(data.episodeDbId).toBe(99);
  });

  it("RSS path: transcriptStatus is null when not set on DB row", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);

    vi.mocked(db.query.episodes.findFirst).mockResolvedValue({
      id: 88,
      title: "RSS Ep 2",
      description: null,
      publishDate: null,
      audioUrl: null,
      duration: null,
      podcastId: 3,
      podcastIndexId: "rss-xyz",
      rssGuid: null,
      transcriptSource: null,
      transcriptStatus: null,
      summary: null,
      processedAt: null,
      keyTakeaways: [],
      worthItScore: null,
      worthItReason: null,
      worthItDimensions: null,
      podcast: null,
    } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/episodes/rss-xyz"
    );
    const response = await GET(request, { params: { id: "rss-xyz" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transcriptStatus).toBeNull();
    expect(data.episodeDbId).toBe(88);
  });
});
