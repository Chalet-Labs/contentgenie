import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

vi.mock("@/lib/security", () => ({ safeFetch: vi.fn() }));

import { safeFetch } from "@/lib/security";
import { lexFridmanExtractor } from "@/trigger/helpers/transcript-extractors/lex-fridman";
import type { ExtractorContext } from "@/trigger/helpers/transcript-extractors/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  join(__dirname, "fixtures", "lex-fridman.html"),
  "utf8",
);

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
  it("appends -transcript and replaces the trailing slash (VERIFY 1)", async () => {
    vi.mocked(safeFetch).mockResolvedValue("plain transcript text");
    await lexFridmanExtractor.extract(
      makeCtx("https://lexfridman.com/jensen-huang/"),
    );
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      "https://lexfridman.com/jensen-huang-transcript",
      expect.anything(),
    );
  });

  it("appends -transcript when the link has no trailing slash (proves replaceTrailingSlash is wired)", async () => {
    vi.mocked(safeFetch).mockResolvedValue("plain transcript text");
    await lexFridmanExtractor.extract(
      makeCtx("https://lexfridman.com/jensen-huang"),
    );
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      "https://lexfridman.com/jensen-huang-transcript",
      expect.anything(),
    );
  });

  it("golden-HTML fixture roundtrip: real HTML strips through to clean text", async () => {
    vi.mocked(safeFetch).mockResolvedValue(fixture);
    const result = await lexFridmanExtractor.extract(
      makeCtx("https://lexfridman.com/jensen-huang/"),
    );
    expect(result).toContain("Jensen Huang");
    expect(result).toContain("Nvidia");
    expect(result).not.toMatch(/<\/?(p|script|html|body)\b/i);
    expect(result).not.toContain("analytics placeholder");
  });
});
