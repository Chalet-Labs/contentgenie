import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/security", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/security";
import { linkSuffixExtractor } from "@/trigger/helpers/transcript-extractors/link-suffix";
import type { ExtractorContext } from "@/trigger/helpers/transcript-extractors/types";

const makeCtx = (link: string | null): ExtractorContext => ({
  episode: { podcastIndexId: "ep1", title: "Ep", link, rssGuid: null },
  podcast: { podcastIndexId: "pod1", title: "Pod" },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("linkSuffixExtractor", () => {
  it("appends suffix to the episode link", async () => {
    vi.mocked(safeFetch).mockResolvedValue("plain transcript text");
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    const result = await extractor.extract(
      makeCtx("https://share.transistor.fm/s/abc123"),
    );
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      "https://share.transistor.fm/s/abc123/transcript",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toBe("plain transcript text");
  });

  it("replaces trailing slash before appending suffix when replaceTrailingSlash is true", async () => {
    vi.mocked(safeFetch).mockResolvedValue("lex transcript");
    const extractor = linkSuffixExtractor({
      id: "lex-fridman",
      suffix: "-transcript",
      replaceTrailingSlash: true,
    });
    const result = await extractor.extract(
      makeCtx("https://lexfridman.com/jensen-huang/"),
    );
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      "https://lexfridman.com/jensen-huang-transcript",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toBe("lex transcript");
  });

  it("falls back to plain append when replaceTrailingSlash is true but link has no trailing slash", async () => {
    vi.mocked(safeFetch).mockResolvedValue("lex transcript no slash");
    const extractor = linkSuffixExtractor({
      id: "lex-fridman",
      suffix: "-transcript",
      replaceTrailingSlash: true,
    });
    const result = await extractor.extract(
      makeCtx("https://lexfridman.com/jensen-huang"),
    );
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      "https://lexfridman.com/jensen-huang-transcript",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toBe("lex transcript no slash");
  });

  it("returns undefined without fetching when link is null", async () => {
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    const result = await extractor.extract(makeCtx(null));
    expect(result).toBeUndefined();
    expect(vi.mocked(safeFetch)).not.toHaveBeenCalled();
  });

  it("returns undefined without fetching when link is empty string", async () => {
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    const result = await extractor.extract(makeCtx(""));
    expect(result).toBeUndefined();
    expect(vi.mocked(safeFetch)).not.toHaveBeenCalled();
  });

  it("strips HTML from the response before returning", async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      "<html><body><p>hello world</p></body></html>",
    );
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    const result = await extractor.extract(
      makeCtx("https://share.transistor.fm/s/abc123"),
    );
    expect(result).toBe("hello world");
    expect(result).not.toMatch(/<[^>]+>/);
  });

  it("truncates transcripts longer than MAX_TRANSCRIPT_LENGTH", async () => {
    vi.mocked(safeFetch).mockResolvedValue("a".repeat(60000));
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    const result = await extractor.extract(
      makeCtx("https://share.transistor.fm/s/abc123"),
    );
    expect(result).toBeDefined();
    expect(result!.endsWith("[Transcript truncated...]")).toBe(true);
  });

  it("returns undefined when body is only whitespace after stripping", async () => {
    vi.mocked(safeFetch).mockResolvedValue("   ");
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    const result = await extractor.extract(
      makeCtx("https://share.transistor.fm/s/abc123"),
    );
    expect(result).toBeUndefined();
  });

  it("propagates errors from safeFetch without swallowing them", async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error("network"));
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    await expect(extractor.extract(makeCtx("https://x.com"))).rejects.toThrow(
      "network",
    );
  });
});
