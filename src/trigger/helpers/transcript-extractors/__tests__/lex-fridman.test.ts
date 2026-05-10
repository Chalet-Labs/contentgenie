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
import { lexFridmanExtractor } from "@/trigger/helpers/transcript-extractors/lex-fridman";
import type { ExtractorContext } from "@/trigger/helpers/transcript-extractors/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

const makeCtx = (link: string | null): ExtractorContext => ({
  episode: {
    podcastIndexId: "ep1",
    title: "Jensen Huang",
    link,
    rssGuid: null,
  },
  podcast: { podcastIndexId: "lex-pod", title: "Lex Fridman" },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lexFridmanExtractor", () => {
  it("builds the correct transcript URL from a trailing-slash episode link", async () => {
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue(
      "plain transcript text",
    );
    const result = await lexFridmanExtractor.extract(
      makeCtx("https://lexfridman.com/jensen-huang/"),
    );
    expect(vi.mocked(fetchTranscriptFromUrl)).toHaveBeenCalledWith(
      "https://lexfridman.com/jensen-huang-transcript",
    );
    expect(result).toBe("plain transcript text");
  });

  it("returns undefined without fetching when link is null", async () => {
    const result = await lexFridmanExtractor.extract(makeCtx(null));
    expect(result).toBeUndefined();
    expect(vi.mocked(fetchTranscriptFromUrl)).not.toHaveBeenCalled();
  });

  it("returns undefined without fetching when link is empty string", async () => {
    const result = await lexFridmanExtractor.extract(makeCtx(""));
    expect(result).toBeUndefined();
    expect(vi.mocked(fetchTranscriptFromUrl)).not.toHaveBeenCalled();
  });

  it("returns undefined when fetchTranscriptFromUrl returns undefined", async () => {
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue(undefined);
    const result = await lexFridmanExtractor.extract(
      makeCtx("https://lexfridman.com/jensen-huang/"),
    );
    expect(result).toBeUndefined();
  });

  it("golden-HTML fixture roundtrip: returns stripped text from the fixture", async () => {
    const fixture = readFileSync(
      join(__dirname, "fixtures", "lex-fridman.html"),
      "utf8",
    );
    const expectedText = stripHtmlTranscript(fixture).trim();
    expect(expectedText).not.toBe("");

    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue(expectedText);
    const result = await lexFridmanExtractor.extract(
      makeCtx("https://lexfridman.com/jensen-huang/"),
    );
    expect(result).toBe(expectedText);
  });
});
