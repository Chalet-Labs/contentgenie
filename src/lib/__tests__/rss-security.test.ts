import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parsePodcastFeed } from "@/lib/rss";

// Mock dns.lookup to control hostname resolution in SSRF tests.
// vi.hoisted ensures the mock is available at hoist time for vi.mock.
const { mockDnsLookup } = vi.hoisted(() => ({
  mockDnsLookup: vi.fn(),
}));
vi.mock("node:dns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns")>();
  return {
    ...actual,
    default: {
      ...(actual as Record<string, unknown>),
      lookup: mockDnsLookup,
    },
    lookup: mockDnsLookup,
  };
});

// Mock fetch
const mockFetch = vi.fn();
const PUBLIC_IP = "93.184.216.34"; // example.com (public IP for deterministic SSRF tests)

describe("SSRF Protection via safeFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should fail if redirected to a private IP", async () => {
    // Simulate a redirect to a private IP
    mockFetch.mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === `https://${PUBLIC_IP}/feed.xml`) {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: "http://127.0.0.1/secret" }),
          text: async () => "",
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    // This should fail with an error about unsafe redirect
    await expect(parsePodcastFeed(`https://${PUBLIC_IP}/feed.xml`)).rejects.toThrow();

    // Ensure fetch was called for the initial URL
    expect(mockFetch).toHaveBeenCalledWith(`https://${PUBLIC_IP}/feed.xml`, expect.objectContaining({ redirect: "manual" }));
    // Ensure fetch was NOT called for the private IP
    expect(mockFetch).not.toHaveBeenCalledWith("http://127.0.0.1/secret", expect.anything());
  });

  it("should follow safe redirects", async () => {
    // Simulate a redirect to a safe URL
    mockFetch.mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === `http://${PUBLIC_IP}/feed.xml`) {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: `https://${PUBLIC_IP}/feed.xml` }),
          text: async () => "",
        } as Response;
      }
      if (urlStr === `https://${PUBLIC_IP}/feed.xml`) {
        return {
          ok: true,
          status: 200,
          text: async () => '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Safe Podcast</title><description>A safe podcast</description><item><title>Episode 1</title><enclosure url="https://example.com/ep1.mp3" type="audio/mpeg"/></item></channel></rss>',
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    // This should succeed (safe HTTP -> HTTPS redirect should be allowed)
    const result = await parsePodcastFeed(`http://${PUBLIC_IP}/feed.xml`);
    expect(result.title).toBe("Safe Podcast");
    expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + redirect
  });

  it("should enforce a maximum redirect limit to prevent loops", async () => {
    mockFetch.mockImplementation(async () => {
      return {
        ok: false,
        status: 301,
        headers: new Headers({ Location: `https://${PUBLIC_IP}/loop-feed.xml` }),
        text: async () => "",
      } as Response;
    });

    await expect(parsePodcastFeed(`https://${PUBLIC_IP}/loop-feed.xml`)).rejects.toThrow(
      /too many redirects/i
    );
  });

  it("should correctly handle relative URL redirects", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr === `https://${PUBLIC_IP}/start.xml`) {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: "/feed.xml" }),
          text: async () => "",
        } as Response;
      }
      if (urlStr === `https://${PUBLIC_IP}/feed.xml`) {
        return {
          ok: true,
          status: 200,
          text: async () => '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Relative Redirect Podcast</title><description>Test</description><item><title>Ep</title><enclosure url="https://example.com/ep.mp3" type="audio/mpeg"/></item></channel></rss>',
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const result = await parsePodcastFeed(`https://${PUBLIC_IP}/start.xml`);
    expect(result.title).toBe("Relative Redirect Podcast");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should treat redirects to private IPs as unsafe", async () => {
    // Initial URL is safe (PUBLIC_IP), but redirect target is a private IP
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr === `https://${PUBLIC_IP}/encoded-feed.xml`) {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: "http://10.0.0.1/secret" }),
          text: async () => "",
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    await expect(parsePodcastFeed(`https://${PUBLIC_IP}/encoded-feed.xml`)).rejects.toThrow(
      /unsafe url/i
    );
  });

  it("should detect unsafe targets in a multi-hop redirect chain", async () => {
    // First hop is safe (PUBLIC_IP → PUBLIC_IP), second hop goes to private IP
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr === `https://${PUBLIC_IP}/chain-start.xml`) {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: `https://${PUBLIC_IP}/chain-hop2.xml` }),
          text: async () => "",
        } as Response;
      }
      if (urlStr === `https://${PUBLIC_IP}/chain-hop2.xml`) {
        return {
          ok: false,
          status: 301,
          headers: new Headers({ Location: "http://127.0.0.1/internal" }),
          text: async () => "",
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    await expect(parsePodcastFeed(`https://${PUBLIC_IP}/chain-start.xml`)).rejects.toThrow(
      /unsafe url/i
    );
  });
});

describe("SSRF Protection via hostname DNS resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should resolve hostname via DNS and allow when all IPs are public", async () => {
    mockDnsLookup.mockImplementation(
      (hostname: string, options: unknown, callback: Function) => {
        callback(null, [{ address: "93.184.216.34", family: 4 }]);
      }
    );

    mockFetch.mockImplementation(async (url: string | URL) => {
      if (url.toString() === "https://safe.example.com/feed.xml") {
        return {
          ok: true,
          status: 200,
          text: async () =>
            '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>DNS Resolved Podcast</title><description>Test</description><item><title>Ep</title><enclosure url="https://example.com/ep.mp3" type="audio/mpeg"/></item></channel></rss>',
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const result = await parsePodcastFeed("https://safe.example.com/feed.xml");
    expect(result.title).toBe("DNS Resolved Podcast");
    // Verify DNS lookup was actually called (hostname path, not IP fast-path)
    expect(mockDnsLookup).toHaveBeenCalledWith(
      "safe.example.com",
      expect.objectContaining({ all: true }),
      expect.any(Function)
    );
  });

  it("should block hostname that resolves to a private IP", async () => {
    mockDnsLookup.mockImplementation(
      (hostname: string, options: unknown, callback: Function) => {
        callback(null, [{ address: "10.0.0.1", family: 4 }]);
      }
    );

    await expect(
      parsePodcastFeed("https://evil.example.com/feed.xml")
    ).rejects.toThrow(/unsafe url/i);

    expect(mockDnsLookup).toHaveBeenCalledWith(
      "evil.example.com",
      expect.objectContaining({ all: true }),
      expect.any(Function)
    );
    // Fetch should never be called — URL blocked before fetching
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
