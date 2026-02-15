import { describe, it, expect, vi, beforeEach } from "vitest";
import dns from "node:dns";

import { pinnedLookup, createDnsPinningAgent } from "../dns-pinning-agent";

vi.mock("node:dns", () => ({
  default: {
    lookup: vi.fn(),
  },
}));

vi.mock("@/lib/security", () => ({
  isPrivateIP: (ip: string): boolean => {
    // Minimal private IP check for tests — matches the real implementation's behavior
    if (ip === "127.0.0.1" || ip === "10.0.0.1" || ip === "192.168.1.1") return true;
    if (ip === "169.254.169.254") return true;
    if (ip === "::1") return true;
    if (ip === "::ffff:127.0.0.1") return true;
    return false;
  },
}));

function mockDnsLookup(
  results: { address: string; family: number }[] | Error,
) {
  (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (
      _hostname: string,
      _opts: unknown,
      cb: (
        err: NodeJS.ErrnoException | null,
        addresses: { address: string; family: number }[],
      ) => void,
    ) => {
      if (results instanceof Error) {
        cb(results, []);
      } else {
        cb(null, results);
      }
    },
  );
}

/** Promise wrapper around pinnedLookup for easier test assertions. */
function lookupAsync(
  hostname: string,
): Promise<{ address: string; family: number }> {
  return new Promise((resolve, reject) => {
    pinnedLookup(hostname, {}, (err, address, family) => {
      if (err) {
        reject(err);
      } else {
        resolve({ address, family });
      }
    });
  });
}

describe("pinnedLookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the first public IP when all IPs are public", async () => {
    mockDnsLookup([
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 },
    ]);

    const result = await lookupAsync("example.com");
    expect(result).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("calls dns.lookup with { all: true }", async () => {
    mockDnsLookup([{ address: "93.184.216.34", family: 4 }]);

    await lookupAsync("example.com");

    const lookupMock = dns.lookup as unknown as ReturnType<typeof vi.fn>;
    expect(lookupMock).toHaveBeenCalledWith(
      "example.com",
      expect.objectContaining({ all: true }),
      expect.any(Function),
    );
  });

  it("rejects when DNS resolves to a private IPv4 address", async () => {
    mockDnsLookup([{ address: "127.0.0.1", family: 4 }]);

    await expect(lookupAsync("evil.example.com")).rejects.toThrow(
      /private IP.*127\.0\.0\.1/,
    );
  });

  it("rejects when DNS resolves to a private link-local address", async () => {
    mockDnsLookup([{ address: "169.254.169.254", family: 4 }]);

    await expect(lookupAsync("metadata.example.com")).rejects.toThrow(
      /private IP.*169\.254\.169\.254/,
    );
  });

  it("rejects when ANY resolved IP is private (mixed public + private)", async () => {
    mockDnsLookup([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);

    await expect(lookupAsync("mixed.example.com")).rejects.toThrow(
      /private IP.*10\.0\.0\.1/,
    );
  });

  it("rejects when DNS resolution fails (fail-closed)", async () => {
    mockDnsLookup(new Error("ENOTFOUND"));

    await expect(lookupAsync("nonexistent.example.com")).rejects.toThrow(
      "ENOTFOUND",
    );
  });

  it("rejects when DNS returns no addresses", async () => {
    mockDnsLookup([]);

    await expect(lookupAsync("empty.example.com")).rejects.toThrow(
      /no addresses/,
    );
  });

  it("rejects when DNS resolves to private IPv6 loopback", async () => {
    mockDnsLookup([{ address: "::1", family: 6 }]);

    await expect(lookupAsync("ipv6-loopback.example.com")).rejects.toThrow(
      /private IP.*::1/,
    );
  });

  it("rejects when DNS resolves to IPv4-mapped IPv6 private address", async () => {
    mockDnsLookup([{ address: "::ffff:127.0.0.1", family: 6 }]);

    await expect(lookupAsync("mapped.example.com")).rejects.toThrow(
      /private IP.*::ffff:127\.0\.0\.1/,
    );
  });

  it("preserves caller dnsOptions while forcing all: true", async () => {
    mockDnsLookup([{ address: "93.184.216.34", family: 4 }]);

    await new Promise<void>((resolve, reject) => {
      pinnedLookup("example.com", { family: 4 }, (err, address) => {
        if (err) return reject(err);
        expect(address).toBe("93.184.216.34");
        resolve();
      });
    });

    const lookupMock = dns.lookup as unknown as ReturnType<typeof vi.fn>;
    expect(lookupMock).toHaveBeenCalledWith(
      "example.com",
      expect.objectContaining({ family: 4, all: true }),
      expect.any(Function),
    );
  });
});

describe("createDnsPinningAgent", () => {
  it("creates an agent without errors", () => {
    const agent = createDnsPinningAgent();
    expect(agent).toBeDefined();
    agent.close();
  });

  it("creates an agent with maxCachedSessions option", () => {
    const agent = createDnsPinningAgent({ maxCachedSessions: 10 });
    expect(agent).toBeDefined();
    agent.close();
  });
});
