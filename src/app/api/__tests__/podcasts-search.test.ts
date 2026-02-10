import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/podcasts/search/route";
import { searchPodcasts, searchByPerson } from "@/lib/podcastindex";
import { searchLocalPodcasts } from "@/lib/podcast-search";

vi.mock("@/lib/podcastindex", () => ({
  searchPodcasts: vi.fn(),
  searchByPerson: vi.fn(),
}));

vi.mock("@/lib/podcast-search", () => ({
  searchLocalPodcasts: vi.fn(),
}));

function mockAllLayersEmpty() {
  vi.mocked(searchPodcasts).mockResolvedValue({
    status: "true",
    feeds: [],
    count: 0,
    query: "",
    description: "",
  });
  vi.mocked(searchByPerson).mockResolvedValue({
    status: "true",
    items: [],
    count: 0,
    query: "",
    description: "",
  });
  vi.mocked(searchLocalPodcasts).mockResolvedValue([]);
}

describe("GET /api/podcasts/search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns 400 when query is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/podcasts/search");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Search query is required");
  });

  it("returns 500 when API credentials are missing", async () => {
    vi.stubEnv("PODCASTINDEX_API_KEY", "");
    vi.stubEnv("PODCASTINDEX_API_SECRET", "");

    const request = new NextRequest(
      "http://localhost:3000/api/podcasts/search?q=test"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("PodcastIndex API credentials not configured");
  });

  it("returns merged search results from all layers", async () => {
    vi.stubEnv("PODCASTINDEX_API_KEY", "key");
    vi.stubEnv("PODCASTINDEX_API_SECRET", "secret");

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
    vi.mocked(searchByPerson).mockResolvedValue({
      status: "true",
      items: [
        { feedId: 3, title: "Person Episode", feedTitle: "Person Pod", feedImage: "img.jpg" } as never,
      ],
      count: 1,
      query: "test",
      description: "Found 1",
    });
    vi.mocked(searchLocalPodcasts).mockResolvedValue([
      {
        podcastIndexId: "4",
        title: "Local Match",
        publisher: "Local Publisher",
        score: 5,
      },
    ]);

    const request = new NextRequest(
      "http://localhost:3000/api/podcasts/search?q=test&max=10"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.podcasts).toHaveLength(4);
    expect(data.count).toBe(4);
    expect(data.query).toBe("test");
    // byterm results come first
    expect(data.podcasts[0].title).toBe("Test Pod");
    expect(data.podcasts[1].title).toBe("Another Pod");
    // byperson results next (feedTitle preferred over episode title)
    expect(data.podcasts[2].title).toBe("Person Pod");
    // local results last
    expect(data.podcasts[3].title).toBe("Local Match");
  });

  it("passes similar=true to searchPodcasts", async () => {
    vi.stubEnv("PODCASTINDEX_API_KEY", "key");
    vi.stubEnv("PODCASTINDEX_API_SECRET", "secret");
    mockAllLayersEmpty();

    const request = new NextRequest(
      "http://localhost:3000/api/podcasts/search?q=test&max=10"
    );
    await GET(request);

    expect(searchPodcasts).toHaveBeenCalledWith("test", 10, { similar: true });
  });

  it("deduplicates results across layers by ID", async () => {
    vi.stubEnv("PODCASTINDEX_API_KEY", "key");
    vi.stubEnv("PODCASTINDEX_API_SECRET", "secret");

    vi.mocked(searchPodcasts).mockResolvedValue({
      status: "true",
      feeds: [{ id: 1, title: "Pod One" } as never],
      count: 1,
      query: "test",
      description: "",
    });
    vi.mocked(searchByPerson).mockResolvedValue({
      status: "true",
      items: [
        { feedId: 1, title: "Dup Episode", feedImage: "img.jpg" } as never,
      ],
      count: 1,
      query: "test",
      description: "",
    });
    vi.mocked(searchLocalPodcasts).mockResolvedValue([
      { podcastIndexId: "1", title: "Dup Local", publisher: null, score: 5 },
    ]);

    const request = new NextRequest(
      "http://localhost:3000/api/podcasts/search?q=test"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.podcasts).toHaveLength(1);
    expect(data.podcasts[0].title).toBe("Pod One");
  });

  it("returns results when byterm fails (graceful degradation)", async () => {
    vi.stubEnv("PODCASTINDEX_API_KEY", "key");
    vi.stubEnv("PODCASTINDEX_API_SECRET", "secret");

    vi.mocked(searchPodcasts).mockRejectedValue(new Error("API down"));
    vi.mocked(searchByPerson).mockResolvedValue({
      status: "true",
      items: [],
      count: 0,
      query: "test",
      description: "",
    });
    vi.mocked(searchLocalPodcasts).mockResolvedValue([
      {
        podcastIndexId: "100",
        title: "Local Result",
        publisher: "Publisher",
        score: 5,
      },
    ]);

    const request = new NextRequest(
      "http://localhost:3000/api/podcasts/search?q=test"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.podcasts).toHaveLength(1);
    expect(data.podcasts[0].title).toBe("Local Result");
  });

  it("returns results when local search fails (graceful degradation)", async () => {
    vi.stubEnv("PODCASTINDEX_API_KEY", "key");
    vi.stubEnv("PODCASTINDEX_API_SECRET", "secret");

    vi.mocked(searchPodcasts).mockResolvedValue({
      status: "true",
      feeds: [{ id: 1, title: "API Result" } as never],
      count: 1,
      query: "test",
      description: "",
    });
    vi.mocked(searchByPerson).mockResolvedValue({
      status: "true",
      items: [],
      count: 0,
      query: "test",
      description: "",
    });
    vi.mocked(searchLocalPodcasts).mockRejectedValue(new Error("DB error"));

    const request = new NextRequest(
      "http://localhost:3000/api/podcasts/search?q=test"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.podcasts).toHaveLength(1);
    expect(data.podcasts[0].title).toBe("API Result");
  });

  it("returns empty results when all layers return nothing", async () => {
    vi.stubEnv("PODCASTINDEX_API_KEY", "key");
    vi.stubEnv("PODCASTINDEX_API_SECRET", "secret");
    mockAllLayersEmpty();

    const request = new NextRequest(
      "http://localhost:3000/api/podcasts/search?q=zzzznothing"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.podcasts).toHaveLength(0);
    expect(data.count).toBe(0);
  });
});
