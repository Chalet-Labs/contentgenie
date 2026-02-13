import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parsePodcastFeed } from "@/lib/rss";
import * as security from "@/lib/security";

// Mock isSafeUrl
vi.mock("@/lib/security", async () => {
  const actual = await vi.importActual("@/lib/security");
  return {
    ...actual,
    isSafeUrl: vi.fn(),
  };
});

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("SSRF Protection via safeFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(security.isSafeUrl).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should fail if redirected to a private IP", async () => {
    // Simulate a redirect to a private IP
    mockFetch.mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === "https://example.com/feed.xml") {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: "http://127.0.0.1/secret" }),
          text: async () => "",
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    // Mock isSafeUrl behavior
    vi.mocked(security.isSafeUrl).mockImplementation(async (url) => {
      if (url.includes("127.0.0.1")) return false;
      return true;
    });

    // This should fail with an error about unsafe redirect
    await expect(parsePodcastFeed("https://example.com/feed.xml")).rejects.toThrow();

    // Ensure fetch was called for the initial URL
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/feed.xml", expect.objectContaining({ redirect: "manual" }));
    // Ensure fetch was NOT called for the private IP
    expect(mockFetch).not.toHaveBeenCalledWith("http://127.0.0.1/secret", expect.anything());
  });

  it("should follow safe redirects", async () => {
    // Simulate a redirect to a safe URL
    mockFetch.mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === "http://example.com/feed.xml") {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: "https://example.com/feed.xml" }),
          text: async () => "",
        } as Response;
      }
      if (urlStr === "https://example.com/feed.xml") {
        return {
          ok: true,
          status: 200,
          text: async () => '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Safe Podcast</title><description>A safe podcast</description><item><title>Episode 1</title><enclosure url="https://example.com/ep1.mp3" type="audio/mpeg"/></item></channel></rss>',
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    vi.mocked(security.isSafeUrl).mockResolvedValue(true);

    // This should succeed (safe HTTP -> HTTPS redirect should be allowed)
    const result = await parsePodcastFeed("http://example.com/feed.xml");
    expect(result.title).toBe("Safe Podcast");
    expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + redirect
  });

  it("should enforce a maximum redirect limit to prevent loops", async () => {
    // Use example.com which resolves to a public IP (real isSafeUrl is called internally)
    mockFetch.mockImplementation(async () => {
      return {
        ok: false,
        status: 301,
        headers: new Headers({ Location: "https://example.com/loop-feed.xml" }),
        text: async () => "",
      } as Response;
    });

    await expect(parsePodcastFeed("https://example.com/loop-feed.xml")).rejects.toThrow(
      /too many redirects/i
    );
  });

  it("should correctly handle relative URL redirects", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr === "https://example.com/start.xml") {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: "/feed.xml" }),
          text: async () => "",
        } as Response;
      }
      if (urlStr === "https://example.com/feed.xml") {
        return {
          ok: true,
          status: 200,
          text: async () => '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Relative Redirect Podcast</title><description>Test</description><item><title>Ep</title><enclosure url="https://example.com/ep.mp3" type="audio/mpeg"/></item></channel></rss>',
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const result = await parsePodcastFeed("https://example.com/start.xml");
    expect(result.title).toBe("Relative Redirect Podcast");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should treat redirects to private IPs as unsafe", async () => {
    // Initial URL is safe (example.com), but redirect target is a private IP
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr === "https://example.com/encoded-feed.xml") {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: "http://10.0.0.1/secret" }),
          text: async () => "",
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    await expect(parsePodcastFeed("https://example.com/encoded-feed.xml")).rejects.toThrow(
      /unsafe url/i
    );
  });

  it("should detect unsafe targets in a multi-hop redirect chain", async () => {
    // First hop is safe (example.com → example.com), second hop goes to private IP
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr === "https://example.com/chain-start.xml") {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: "https://example.com/chain-hop2.xml" }),
          text: async () => "",
        } as Response;
      }
      if (urlStr === "https://example.com/chain-hop2.xml") {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: "http://127.0.0.1/internal" }),
          text: async () => "",
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    await expect(parsePodcastFeed("https://example.com/chain-start.xml")).rejects.toThrow(
      /unsafe url/i
    );
  });
});
