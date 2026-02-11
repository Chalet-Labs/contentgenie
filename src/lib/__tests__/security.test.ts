import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPrivateIP, isSafeUrl } from "../security";
import dns from "node:dns";

vi.mock("node:dns", () => ({
  default: {
    lookup: vi.fn(),
  },
}));

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

  it("identifies public IPv6 addresses", () => {
    expect(isPrivateIP("2001:4860:4860::8888")).toBe(false);
  });
});

describe("isSafeUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows safe public URLs", async () => {
    // @ts-ignore
    dns.lookup.mockImplementation((hostname, cb) => cb(null, { address: "8.8.8.8" }));
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
    dns.lookup.mockImplementation((hostname, cb) => cb(null, { address: "127.0.0.1" }));
    expect(await isSafeUrl("https://malicious.com/feed.xml")).toBe(false);
  });

  it("blocks when DNS resolution fails", async () => {
    // @ts-ignore
    dns.lookup.mockImplementation((hostname, cb) => cb(new Error("ENOTFOUND")));
    expect(await isSafeUrl("https://nonexistent.example.com/feed.xml")).toBe(false);
  });
});
