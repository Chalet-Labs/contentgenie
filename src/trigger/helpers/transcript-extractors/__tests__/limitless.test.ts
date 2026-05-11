import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

vi.mock("@/lib/security", () => ({ safeFetch: vi.fn() }));

import { safeFetch } from "@/lib/security";
import { limitlessExtractor } from "@/trigger/helpers/transcript-extractors/limitless";
import type { ExtractorContext } from "@/trigger/helpers/transcript-extractors/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  join(__dirname, "fixtures", "limitless.html"),
  "utf8",
);

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
  it("appends /transcript to the episode link (VERIFY 2)", async () => {
    vi.mocked(safeFetch).mockResolvedValue("plain transcript text");
    await limitlessExtractor.extract(
      makeCtx("https://share.transistor.fm/s/51de038d"),
    );
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      "https://share.transistor.fm/s/51de038d/transcript",
      expect.anything(),
    );
  });

  it("golden-HTML fixture roundtrip: real HTML strips through to clean text", async () => {
    vi.mocked(safeFetch).mockResolvedValue(fixture);
    const result = await limitlessExtractor.extract(
      makeCtx("https://share.transistor.fm/s/51de038d"),
    );
    expect(result).toContain("AI agents");
    expect(result).toContain("Hallucination");
    expect(result).not.toMatch(/<\/?(p|script|html|body|div)\b/i);
    expect(result).not.toContain("tracking placeholder");
  });
});
