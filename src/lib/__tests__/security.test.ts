import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { isPrivateIP, isSafeUrl, safeFetch } from "@/lib/security";
import { dnsPinningAgent, pinnedLookup } from "@/lib/dns-pinning-agent";
import dns from "node:dns";

vi.mock("node:dns", () => ({
  default: {
    lookup: vi.fn(),
  },
}));

// Default DNS mock resolving to a public IP — override in specific tests
function mockDnsPublic() {
  // @ts-ignore
  dns.lookup.mockImplementation(
    (hostname: string, opts: unknown, cb?: unknown) => {
      // Handle both (hostname, cb) and (hostname, opts, cb) signatures
      const callback = typeof opts === "function" ? opts : cb;
      // Return array format for { all: true }
      (callback as Function)(null, [{ address: "93.184.216.34", family: 4 }]);
    },
  );
}

describe("isPrivateIP", () => {
  it("identifies private IPv4 addresses", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("172.16.0.1")).toBe(true);
    expect(isPrivateIP("192.168.1.1")).toBe(true);
    expect(isPrivateIP("169.254.169.254")).toBe(true);
    expect(isPrivateIP("0.0.0.0")).toBe(true);
  });

  it("identifies public IPv4 addresses", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("1.1.1.1")).toBe(false);
    expect(isPrivateIP("142.250.125.113")).toBe(false);
  });

  it("identifies private IPv6 addresses", () => {
    expect(isPrivateIP("::1")).toBe(true);
    expect(isPrivateIP("fc00::1")).toBe(true);
    expect(isPrivateIP("fd00::1")).toBe(true);
    expect(isPrivateIP("fe80::1")).toBe(true);
    expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
  });

  it("identifies IPv4-mapped IPv6 in hex notation as private", () => {
    // ::ffff:7f00:1 is the hex form of ::ffff:127.0.0.1
    expect(isPrivateIP("::ffff:7f00:1")).toBe(true);
    // ::ffff:c0a8:1 is the hex form of ::ffff:192.168.0.1
    expect(isPrivateIP("::ffff:c0a8:1")).toBe(true);
    // ::ffff:a9fe:a9fe is the hex form of ::ffff:169.254.169.254
    expect(isPrivateIP("::ffff:a9fe:a9fe")).toBe(true);
    // ::ffff:a00:1 is the hex form of ::ffff:10.0.0.1
    expect(isPrivateIP("::ffff:a00:1")).toBe(true);
  });

  it("identifies IPv4-mapped IPv6 in hex notation as public", () => {
    // ::ffff:0808:0808 is the hex form of ::ffff:8.8.8.8
    expect(isPrivateIP("::ffff:808:808")).toBe(false);
  });

  it("identifies Teredo addresses in compressed forms", () => {
    expect(isPrivateIP("2001:0000::1")).toBe(true);
    expect(isPrivateIP("2001:0:a:b::1")).toBe(true);
    expect(isPrivateIP("2001::1")).toBe(true);
  });

  it("identifies discard prefix addresses", () => {
    expect(isPrivateIP("100::1")).toBe(true);
    expect(isPrivateIP("0100::1")).toBe(true);
  });

  it("identifies public IPv6 addresses", () => {
    expect(isPrivateIP("2001:4860:4860::8888")).toBe(false);
  });
});

describe("isSafeUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDnsPublic();
  });

  it("allows safe public URLs", async () => {
    expect(await isSafeUrl("https://google.com/feed.xml")).toBe(true);
  });

  it("blocks non-http/https protocols", async () => {
    expect(await isSafeUrl("ftp://example.com/feed.xml")).toBe(false);
    expect(await isSafeUrl("gopher://example.com/")).toBe(false);
    expect(await isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  it("blocks non-standard ports", async () => {
    expect(await isSafeUrl("https://example.com:8080/feed.xml")).toBe(false);
    expect(await isSafeUrl("http://example.com:22/")).toBe(false);
    expect(await isSafeUrl("https://example.com:443/feed.xml")).toBe(true);
    expect(await isSafeUrl("http://example.com:80/feed.xml")).toBe(true);
  });

  it("blocks cross-protocol port usage", async () => {
    // https on port 80 and http on port 443 should be blocked
    expect(await isSafeUrl("https://example.com:80/feed.xml")).toBe(false);
    expect(await isSafeUrl("http://example.com:443/feed.xml")).toBe(false);
  });

  it("blocks local hostnames", async () => {
    expect(await isSafeUrl("http://localhost/feed.xml")).toBe(false);
    expect(await isSafeUrl("http://my.server.local/")).toBe(false);
  });

  it("blocks private IPs", async () => {
    expect(await isSafeUrl("http://127.0.0.1/feed.xml")).toBe(false);
    expect(await isSafeUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(await isSafeUrl("http://[::1]/feed.xml")).toBe(false);
  });

  it("blocks hostnames resolving to private IPs", async () => {
    // @ts-ignore
    dns.lookup.mockImplementation(
      (hostname: string, opts: unknown, cb?: unknown) => {
        const callback = typeof opts === "function" ? opts : cb;
        (callback as Function)(null, [{ address: "127.0.0.1", family: 4 }]);
      },
    );
    expect(await isSafeUrl("https://malicious.com/feed.xml")).toBe(false);
  });

  it("blocks when any resolved IP is private", async () => {
    // @ts-ignore
    dns.lookup.mockImplementation(
      (hostname: string, opts: unknown, cb?: unknown) => {
        const callback = typeof opts === "function" ? opts : cb;
        (callback as Function)(null, [
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.1", family: 4 },
        ]);
      },
    );
    expect(await isSafeUrl("https://dual-record.com/feed.xml")).toBe(false);
  });

  it("blocks when DNS resolution fails", async () => {
    // @ts-ignore
    dns.lookup.mockImplementation(
      (hostname: string, opts: unknown, cb?: unknown) => {
        const callback = typeof opts === "function" ? opts : cb;
        (callback as Function)(new Error("ENOTFOUND"));
      },
    );
    expect(await isSafeUrl("https://nonexistent.example.com/feed.xml")).toBe(false);
  });
});

describe("safeFetch", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDnsPublic();

    // Mock global fetch to avoid real network calls
    fetchSpy = vi.fn().mockResolvedValue(
      new Response("<rss>mock</rss>", {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  it("passes dispatcher option to fetch", async () => {
    await safeFetch("https://example.com/feed.xml");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/feed.xml",
      expect.objectContaining({
        dispatcher: expect.anything(),
        redirect: "manual",
      }),
    );
  });

  it("includes dnsPinningAgent as the dispatcher", async () => {
    await safeFetch("https://example.com/feed.xml");

    const callArgs = fetchSpy.mock.calls[0][1];
    // Verify the exact singleton agent is used for DNS-pinning SSRF protection
    expect(callArgs.dispatcher).toBe(dnsPinningAgent);
  });

  it("still rejects unsafe URLs before fetching", async () => {
    await expect(
      safeFetch("http://127.0.0.1/feed.xml"),
    ).rejects.toThrow(/Unsafe URL/);

    // fetch should not have been called
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns response body for safe URLs", async () => {
    const result = await safeFetch("https://example.com/feed.xml");
    expect(result).toBe("<rss>mock</rss>");
  });
});

describe("safeFetch DNS rebinding protection", () => {
  let fetchSpy: Mock;
  const dnsLookupMock = dns.lookup as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    fetchSpy = vi.fn().mockResolvedValue(
      new Response("<rss>safe</rss>", {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      }),
    );

    // Create a fetch stub that simulates undici's DNS-pinning behavior.
    // A simple vi.stubGlobal("fetch", fetchSpy) would bypass the dispatcher,
    // so we intercept the dispatcher option and invoke pinnedLookup manually.
    vi.stubGlobal(
      "fetch",
      async (url: RequestInfo | URL, options?: RequestInit) => {
        if ((options as Record<string, unknown>)?.dispatcher) {
          const hostname = new URL(url.toString()).hostname;
          await new Promise<void>((resolve, reject) => {
            pinnedLookup(hostname, {}, (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        }
        return fetchSpy(url, options);
      },
    );
  });

  it("rejects when DNS rebinds to a private IP at connection time", async () => {
    // Simulate DNS rebinding: isSafeUrl's lookup returns a public IP,
    // but the agent's pinnedLookup (second call) returns a private IP.
    let callCount = 0;
    dnsLookupMock.mockImplementation(
      (_hostname: string, _opts: unknown, cb?: unknown) => {
        const callback = typeof _opts === "function" ? _opts : cb;
        callCount++;
        if (callCount === 1) {
          // isSafeUrl pre-check: returns public IP — passes validation
          (callback as Function)(null, [{ address: "93.184.216.34", family: 4 }]);
        } else {
          // pinnedLookup at connection time: DNS has rebinding to private IP
          (callback as Function)(null, [{ address: "169.254.169.254", family: 4 }]);
        }
      },
    );

    // The fetch stub invokes pinnedLookup, which will call dns.lookup (2nd call),
    // see the private IP, and reject — proving the dns-pinning agent blocks rebinding.
    await expect(safeFetch("https://rebind.evil.com/feed.xml")).rejects.toThrow(
      /private IP|169\.254\.169\.254/,
    );
  });

  it("rejects when a redirect target DNS-rebinds to a private IP", async () => {
    // fetch returns a redirect to a second URL
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: "https://redirect-target.evil.com/feed.xml" },
      }),
    );

    // Simulate DNS rebinding on the redirect target.
    // Call 1: isSafeUrl (initial URL) → public IP → safe
    // Call 2: pinnedLookup via fetch stub (initial URL) → public IP → ok
    // Call 3: isSafeUrl (redirect URL) → public IP → safe
    // Call 4: pinnedLookup via fetch stub (redirect URL) → private IP → rejected
    let callCount = 0;
    dnsLookupMock.mockImplementation(
      (_hostname: string, _opts: unknown, cb?: unknown) => {
        const callback = typeof _opts === "function" ? _opts : cb;
        callCount++;
        if (callCount <= 3) {
          // First 3 calls: all safe (isSafeUrl + fetch for first URL, isSafeUrl for redirect)
          (callback as Function)(null, [{ address: "93.184.216.34", family: 4 }]);
        } else {
          // 4th call: pinnedLookup for redirect target rebinds to private IP
          (callback as Function)(null, [{ address: "10.0.0.1", family: 4 }]);
        }
      },
    );

    await expect(
      safeFetch("https://safe-origin.com/feed.xml"),
    ).rejects.toThrow(/private IP|10\.0\.0\.1/);
  });

  it("passes dnsPinningAgent as dispatcher on every redirect hop", async () => {
    mockDnsPublic();

    fetchSpy
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { Location: "https://hop1.example.com/feed.xml" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://hop2.example.com/feed.xml" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("<rss>final</rss>", {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        }),
      );

    const result = await safeFetch("https://start.example.com/feed.xml");
    expect(result).toBe("<rss>final</rss>");

    // Verify every fetch call used the dns-pinning agent as dispatcher
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    for (const call of fetchSpy.mock.calls) {
      expect(call[1].dispatcher).toBe(dnsPinningAgent);
      expect(call[1].redirect).toBe("manual");
    }
  });
});
