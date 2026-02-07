import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatDuration, formatPublishDate } from "@/lib/podcastindex";

describe("formatDuration", () => {
  it("returns 'Unknown' for 0", () => {
    expect(formatDuration(0)).toBe("Unknown");
  });

  it("returns 'Unknown' for negative values", () => {
    expect(formatDuration(-10)).toBe("Unknown");
  });

  it("formats seconds to minutes", () => {
    expect(formatDuration(90)).toBe("1m");
    expect(formatDuration(300)).toBe("5m");
    expect(formatDuration(60)).toBe("1m");
  });

  it("formats large values with hours and minutes", () => {
    expect(formatDuration(3600)).toBe("1h 0m");
    expect(formatDuration(3661)).toBe("1h 1m");
    expect(formatDuration(7200)).toBe("2h 0m");
    expect(formatDuration(5400)).toBe("1h 30m");
  });

  it("handles seconds less than 60", () => {
    expect(formatDuration(30)).toBe("0m");
    expect(formatDuration(59)).toBe("0m");
  });
});

describe("formatPublishDate", () => {
  it("returns 'Unknown' for 0", () => {
    expect(formatPublishDate(0)).toBe("Unknown");
  });

  it("formats valid timestamps", () => {
    // Jan 15, 2024 00:00:00 UTC = 1705276800
    const result = formatPublishDate(1705276800);
    expect(result).toContain("Jan");
    expect(result).toContain("2024");
    expect(result).toContain("15");
  });
});

// API function tests require mocking crypto and fetch
describe("PodcastIndex API functions", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PODCASTINDEX_API_KEY: "test-api-key",
      PODCASTINDEX_API_SECRET: "test-api-secret",
    };
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("searchPodcasts calls correct endpoint with params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "true",
          feeds: [{ id: 1, title: "Test Podcast" }],
          count: 1,
          query: "test",
          description: "Found 1 feeds",
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { searchPodcasts } = await import("@/lib/podcastindex");
    const result = await searchPodcasts("test", 10);

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/1.0/search/byterm");
    expect(url.searchParams.get("q")).toBe("test");
    expect(url.searchParams.get("max")).toBe("10");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-Auth-Key"]).toBe("test-api-key");
    expect(headers["User-Agent"]).toBe("ContentGenie/1.0");
    expect(headers.Authorization).toBeTruthy();

    expect(result.feeds).toHaveLength(1);
  });

  it("getEpisodeById calls correct endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "true",
          episode: { id: 123, title: "Test Episode" },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { getEpisodeById } = await import("@/lib/podcastindex");
    await getEpisodeById(123);

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/1.0/episodes/byid");
    expect(url.searchParams.get("id")).toBe("123");
  });

  it("getPodcastById calls correct endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "true",
          feed: { id: 456, title: "Podcast" },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { getPodcastById } = await import("@/lib/podcastindex");
    await getPodcastById(456);

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/1.0/podcasts/byfeedid");
    expect(url.searchParams.get("id")).toBe("456");
  });

  it("getTrendingPodcasts passes categories when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "true",
          feeds: [],
          count: 0,
          max: 10,
          since: 0,
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { getTrendingPodcasts } = await import("@/lib/podcastindex");
    await getTrendingPodcasts(10, "en", "Technology");

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/1.0/podcasts/trending");
    expect(url.searchParams.get("cat")).toBe("Technology");
    expect(url.searchParams.get("lang")).toBe("en");
  });

  it("throws on API error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })
    );

    const { searchPodcasts } = await import("@/lib/podcastindex");
    await expect(searchPodcasts("test")).rejects.toThrow(
      "PodcastIndex API error"
    );
  });
});
