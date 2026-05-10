import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/trigger/helpers/transcript", () => ({
  fetchTranscriptFromUrl: vi.fn(),
}));

import { fetchTranscriptFromUrl } from "@/trigger/helpers/transcript";
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
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue(
      "plain transcript text",
    );
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    const result = await extractor.extract(
      makeCtx("https://share.transistor.fm/s/abc123"),
    );
    expect(vi.mocked(fetchTranscriptFromUrl)).toHaveBeenCalledWith(
      "https://share.transistor.fm/s/abc123/transcript",
    );
    expect(result).toBe("plain transcript text");
  });

  it("replaces trailing slash before appending suffix when replaceTrailingSlash is true", async () => {
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue("lex transcript");
    const extractor = linkSuffixExtractor({
      id: "lex-fridman",
      suffix: "-transcript",
      replaceTrailingSlash: true,
    });
    const result = await extractor.extract(
      makeCtx("https://lexfridman.com/jensen-huang/"),
    );
    expect(vi.mocked(fetchTranscriptFromUrl)).toHaveBeenCalledWith(
      "https://lexfridman.com/jensen-huang-transcript",
    );
    expect(result).toBe("lex transcript");
  });

  it("falls back to plain append when replaceTrailingSlash is true but link has no trailing slash", async () => {
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue(
      "lex transcript no slash",
    );
    const extractor = linkSuffixExtractor({
      id: "lex-fridman",
      suffix: "-transcript",
      replaceTrailingSlash: true,
    });
    const result = await extractor.extract(
      makeCtx("https://lexfridman.com/jensen-huang"),
    );
    expect(vi.mocked(fetchTranscriptFromUrl)).toHaveBeenCalledWith(
      "https://lexfridman.com/jensen-huang-transcript",
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
    expect(vi.mocked(fetchTranscriptFromUrl)).not.toHaveBeenCalled();
  });

  it("returns undefined without fetching when link is empty string", async () => {
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    const result = await extractor.extract(makeCtx(""));
    expect(result).toBeUndefined();
    expect(vi.mocked(fetchTranscriptFromUrl)).not.toHaveBeenCalled();
  });

  it("returns undefined when fetchTranscriptFromUrl returns undefined", async () => {
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue(undefined);
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    const result = await extractor.extract(
      makeCtx("https://share.transistor.fm/s/abc123"),
    );
    expect(result).toBeUndefined();
  });

  it("propagates errors from fetchTranscriptFromUrl without swallowing them", async () => {
    vi.mocked(fetchTranscriptFromUrl).mockRejectedValue(new Error("network"));
    const extractor = linkSuffixExtractor({
      id: "transistor",
      suffix: "/transcript",
    });
    await expect(extractor.extract(makeCtx("https://x.com"))).rejects.toThrow(
      "network",
    );
  });
});
