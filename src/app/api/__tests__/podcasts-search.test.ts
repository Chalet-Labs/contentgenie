import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/podcasts/search/route";

vi.mock("@/lib/podcastindex", () => ({
  searchPodcasts: vi.fn(),
}));

describe("GET /api/podcasts/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when query is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/podcasts/search");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Search query is required");
  });

  it("returns 500 when API credentials are missing", async () => {
    const originalKey = process.env.PODCASTINDEX_API_KEY;
    const originalSecret = process.env.PODCASTINDEX_API_SECRET;
    delete process.env.PODCASTINDEX_API_KEY;
    delete process.env.PODCASTINDEX_API_SECRET;

    const request = new NextRequest(
      "http://localhost:3000/api/podcasts/search?q=test"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("PodcastIndex API credentials not configured");

    process.env.PODCASTINDEX_API_KEY = originalKey;
    process.env.PODCASTINDEX_API_SECRET = originalSecret;
  });

  it("returns search results", async () => {
    process.env.PODCASTINDEX_API_KEY = "key";
    process.env.PODCASTINDEX_API_SECRET = "secret";

    const { searchPodcasts } = await import("@/lib/podcastindex");
    vi.mocked(searchPodcasts).mockResolvedValue({
      status: "true",
      feeds: [
        { id: 1, title: "Test Pod" } as never,
        { id: 2, title: "Another Pod" } as never,
      ],
      count: 2,
      query: "test",
      description: "Found 2",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/podcasts/search?q=test&max=10"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.podcasts).toHaveLength(2);
    expect(data.count).toBe(2);
    expect(searchPodcasts).toHaveBeenCalledWith("test", 10);
  });

  it("returns 500 on API error", async () => {
    process.env.PODCASTINDEX_API_KEY = "key";
    process.env.PODCASTINDEX_API_SECRET = "secret";

    const { searchPodcasts } = await import("@/lib/podcastindex");
    vi.mocked(searchPodcasts).mockRejectedValue(new Error("API down"));

    const request = new NextRequest(
      "http://localhost:3000/api/podcasts/search?q=test"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to search podcasts");
  });
});
