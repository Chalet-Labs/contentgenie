import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/security", () => ({
  safeFetch: vi.fn(),
}));

import { extractTranscriptUrl, fetchTranscriptFromUrl } from "@/trigger/helpers/transcript";
import { safeFetch } from "@/lib/security";

describe("extractTranscriptUrl", () => {
  it("extracts URL after 'Transcript:' with newline", () => {
    expect(extractTranscriptUrl("Transcript:\nhttps://example.com/t")).toBe(
      "https://example.com/t"
    );
  });

  it("extracts URL after 'Full transcript:'", () => {
    expect(extractTranscriptUrl("Full transcript: https://example.com/t")).toBe(
      "https://example.com/t"
    );
  });

  it("extracts URL after 'Transcript available:'", () => {
    expect(
      extractTranscriptUrl("Transcript available: https://example.com/t")
    ).toBe("https://example.com/t");
  });

  it("extracts URL with plural 'Transcripts:'", () => {
    expect(extractTranscriptUrl("Transcripts: https://example.com/t")).toBe(
      "https://example.com/t"
    );
  });

  it("strips HTML tags and extracts URL from HTML description", () => {
    const html =
      "<p>Transcript: <a href='https://example.com/t'>https://example.com/t</a></p>";
    expect(extractTranscriptUrl(html)).toBe("https://example.com/t");
  });

  it("returns null for empty string", () => {
    expect(extractTranscriptUrl("")).toBeNull();
  });

  it("returns null when no transcript keyword present", () => {
    expect(extractTranscriptUrl("No link here")).toBeNull();
  });

  it("returns null for URL without transcript keyword", () => {
    expect(extractTranscriptUrl("Check out https://example.com")).toBeNull();
  });
});

describe("fetchTranscriptFromUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns text content on success", async () => {
    vi.mocked(safeFetch).mockResolvedValue("This is transcript text.");

    const result = await fetchTranscriptFromUrl("https://example.com/t");

    expect(result).toBe("This is transcript text.");
    expect(safeFetch).toHaveBeenCalledWith(
      "https://example.com/t",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("strips HTML tags from HTML response", async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      "<!DOCTYPE html><html><body><p>Hello world</p></body></html>"
    );

    const result = await fetchTranscriptFromUrl("https://example.com/t");

    expect(result).not.toContain("<");
    expect(result).toContain("Hello world");
  });

  it("truncates content exceeding MAX_TRANSCRIPT_LENGTH", async () => {
    const longContent = "a".repeat(60000);
    vi.mocked(safeFetch).mockResolvedValue(longContent);

    const result = await fetchTranscriptFromUrl("https://example.com/t");

    expect(result).toBeDefined();
    expect(result!.length).toBeLessThan(longContent.length);
    expect(result).toContain("[Transcript truncated...]");
  });

  it("returns undefined on error", async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error("Network error"));

    const result = await fetchTranscriptFromUrl("https://example.com/t");

    expect(result).toBeUndefined();
  });

  it("returns undefined for empty response", async () => {
    vi.mocked(safeFetch).mockResolvedValue("   ");

    const result = await fetchTranscriptFromUrl("https://example.com/t");

    expect(result).toBeUndefined();
  });
});
