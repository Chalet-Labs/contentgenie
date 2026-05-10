import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

vi.mock("@/trigger/helpers/transcript", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/trigger/helpers/transcript")>();
  return { ...actual, fetchTranscriptFromUrl: vi.fn() };
});

import {
  fetchTranscriptFromUrl,
  stripHtmlTranscript,
} from "@/trigger/helpers/transcript";
import { limitlessExtractor } from "@/trigger/helpers/transcript-extractors/limitless";
import type { ExtractorContext } from "@/trigger/helpers/transcript-extractors/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

const makeCtx = (link: string | null): ExtractorContext => ({
  episode: {
    podcastIndexId: "ep1",
    title: "The Future of AI Agents",
    link,
    rssGuid: null,
  },
  podcast: { podcastIndexId: "limitless-pod", title: "Limitless" },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("limitlessExtractor", () => {
  it("appends /transcript to the episode link", async () => {
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue("limitless transcript");
    const result = await limitlessExtractor.extract(
      makeCtx("https://share.transistor.fm/s/51de038d"),
    );
    expect(vi.mocked(fetchTranscriptFromUrl)).toHaveBeenCalledWith(
      "https://share.transistor.fm/s/51de038d/transcript",
    );
    expect(result).toBe("limitless transcript");
  });

  it("returns undefined without fetching when link is null", async () => {
    const result = await limitlessExtractor.extract(makeCtx(null));
    expect(result).toBeUndefined();
    expect(vi.mocked(fetchTranscriptFromUrl)).not.toHaveBeenCalled();
  });

  it("returns undefined without fetching when link is empty string", async () => {
    const result = await limitlessExtractor.extract(makeCtx(""));
    expect(result).toBeUndefined();
    expect(vi.mocked(fetchTranscriptFromUrl)).not.toHaveBeenCalled();
  });

  it("returns undefined when fetchTranscriptFromUrl returns undefined", async () => {
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue(undefined);
    const result = await limitlessExtractor.extract(
      makeCtx("https://share.transistor.fm/s/51de038d"),
    );
    expect(result).toBeUndefined();
  });

  it("golden-HTML fixture roundtrip: returns stripped text from the fixture", async () => {
    const fixture = readFileSync(
      join(__dirname, "fixtures", "limitless.html"),
      "utf8",
    );
    const expectedText = stripHtmlTranscript(fixture).trim();
    expect(expectedText).not.toBe("");

    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue(expectedText);
    const result = await limitlessExtractor.extract(
      makeCtx("https://share.transistor.fm/s/51de038d"),
    );
    expect(result).toBe(expectedText);
  });
});
