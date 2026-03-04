import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/chapters/route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/security", () => ({
  isSafeUrl: vi.fn(),
  safeFetch: vi.fn(),
}));

vi.mock("@/lib/chapters", () => ({
  parseChapters: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { isSafeUrl, safeFetch } from "@/lib/security";
import { parseChapters } from "@/lib/chapters";

describe("GET /api/chapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/chapters?url=https://example.com/chapters.json"
    );
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when url parameter is missing", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);

    const request = new NextRequest("http://localhost:3000/api/chapters");
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing url parameter" });
  });

  it("returns 403 for an invalid URL", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    vi.mocked(isSafeUrl).mockResolvedValue(false);

    const request = new NextRequest(
      "http://localhost:3000/api/chapters?url=not-a-url"
    );
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "URL not allowed" });
  });

  it("returns 403 for non-http(s) protocols", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    vi.mocked(isSafeUrl).mockResolvedValue(false);

    const request = new NextRequest(
      "http://localhost:3000/api/chapters?url=ftp://example.com/chapters.json"
    );
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "URL not allowed" });
  });

  it("returns 403 when URL is not safe (SSRF)", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    vi.mocked(isSafeUrl).mockResolvedValue(false);

    const request = new NextRequest(
      "http://localhost:3000/api/chapters?url=https://10.0.0.1/chapters.json"
    );
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "URL not allowed" });
  });

  it("returns 502 when upstream fetch fails", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    vi.mocked(isSafeUrl).mockResolvedValue(true);
    vi.mocked(safeFetch).mockRejectedValue(new Error("Network error"));

    const request = new NextRequest(
      "http://localhost:3000/api/chapters?url=https://example.com/chapters.json"
    );
    const response = await GET(request);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch chapters",
    });
  });

  it("returns 502 when upstream returns invalid JSON", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    vi.mocked(isSafeUrl).mockResolvedValue(true);
    vi.mocked(safeFetch).mockResolvedValue("not json {{{");

    const request = new NextRequest(
      "http://localhost:3000/api/chapters?url=https://example.com/chapters.json"
    );
    const response = await GET(request);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Invalid JSON response from chapters URL",
    });
  });

  it("returns parsed chapters on success", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    vi.mocked(isSafeUrl).mockResolvedValue(true);
    vi.mocked(safeFetch).mockResolvedValue(
      JSON.stringify({
        version: "1.2.0",
        chapters: [
          { startTime: 0, title: "Intro" },
          { startTime: 60, title: "Main" },
        ],
      })
    );
    vi.mocked(parseChapters).mockReturnValue([
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Main" },
    ]);

    const request = new NextRequest(
      "http://localhost:3000/api/chapters?url=https://example.com/chapters.json"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      chapters: [
        { startTime: 0, title: "Intro" },
        { startTime: 60, title: "Main" },
      ],
    });
    expect(parseChapters).toHaveBeenCalledWith({
      version: "1.2.0",
      chapters: [
        { startTime: 0, title: "Intro" },
        { startTime: 60, title: "Main" },
      ],
    });
  });
});
