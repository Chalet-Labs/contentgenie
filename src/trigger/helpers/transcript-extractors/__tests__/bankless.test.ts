import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

vi.mock("@/lib/security", () => ({ safeFetch: vi.fn() }));

import { safeFetch } from "@/lib/security";
import {
  banklessExtractor,
  banklessSlug,
} from "@/trigger/helpers/transcript-extractors/bankless";
import type { ExtractorContext } from "@/trigger/helpers/transcript-extractors/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const banklessFixture = readFileSync(
  join(__dirname, "fixtures", "bankless.html"),
  "utf8",
);

const makeCtx = (
  title: string,
  link: string | null = "https://www.bankless.com/podcast/x",
): ExtractorContext => ({
  episode: { podcastIndexId: "ep1", title, link, rssGuid: null },
  podcast: { podcastIndexId: "bankless-pod", title: "Bankless" },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("banklessSlug", () => {
  it("slugifies a normal title (VERIFY 3)", () => {
    expect(
      banklessSlug("MegaETH Token Launch with Co-founders Shuyao and Lei"),
    ).toBe("megaeth-token-launch-with-co-founders-shuyao-and-lei");
  });

  it("strips apostrophes rather than hyphenating them", () => {
    expect(
      banklessSlug(
        "Finding Satoshi: How a Private Investigator Solved the Mystery of Bitcoin's Creator",
      ),
    ).toBe(
      "finding-satoshi-how-a-private-investigator-solved-the-mystery-of-bitcoins-creator",
    );
  });

  it("preserves numbers and strips # symbol", () => {
    expect(banklessSlug("Rollup #120: Oil vs New Highs")).toBe(
      "rollup-120-oil-vs-new-highs",
    );
  });

  it("returns empty string for empty input", () => {
    expect(banklessSlug("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(banklessSlug("   ")).toBe("");
  });

  it("strips apostrophes again to lock in the rule (Crypto's)", () => {
    expect(banklessSlug("Crypto's Nasdaq Problem")).toBe(
      "cryptos-nasdaq-problem",
    );
  });

  it("strips curly right-single-quote U+2019 like a straight apostrophe", () => {
    // Regression: Prettier previously mangled the regex to ASCII-only chars,
    // causing curly apostrophes (common in CMS/Word-authored RSS titles) to
    // produce a hyphen instead of being stripped → wrong slug → 404.
    expect(banklessSlug("Bitcoin’s Creator")).toBe("bitcoins-creator");
  });

  it("strips smart double quotes U+201C / U+201D", () => {
    expect(banklessSlug("“Bitcoin” Token Launch")).toBe("bitcoin-token-launch");
  });
});

describe("banklessExtractor.extract", () => {
  it("happy path: derives URL from title, returns non-empty text (VERIFY 3)", async () => {
    vi.mocked(safeFetch).mockResolvedValue(banklessFixture);
    const result = await banklessExtractor.extract(
      makeCtx("MegaETH Token Launch with Co-founders Shuyao and Lei"),
    );
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      "https://www.bankless.com/podcast/megaeth-token-launch-with-co-founders-shuyao-and-lei",
      expect.anything(),
    );
    expect(result).toBeTruthy();
    expect(result).toContain("[0:02]");
    expect(result).not.toContain("postSidebar");
    expect(result).not.toContain("Post sidebar content here");
  });

  it("returns undefined when safeFetch throws (e.g. 404) (VERIFY 4)", async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error("HTTP 404"));
    const result = await banklessExtractor.extract(
      makeCtx("MegaETH Token Launch with Co-founders Shuyao and Lei"),
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined when TRANSCRIPT marker is missing (VERIFY 4)", async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      '<div id="insideEpisode"><p>No transcript here.</p></div>',
    );
    const result = await banklessExtractor.extract(makeCtx("Some Episode"));
    expect(result).toBeUndefined();
  });

  it("returns undefined when insideEpisode container is missing (VERIFY 4)", async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      "<div><strong>TRANSCRIPT</strong><p>Content without container.</p></div>",
    );
    const result = await banklessExtractor.extract(makeCtx("Some Episode"));
    expect(result).toBeUndefined();
  });

  it("returns undefined when episode title is empty", async () => {
    const result = await banklessExtractor.extract(makeCtx(""));
    expect(result).toBeUndefined();
    expect(vi.mocked(safeFetch)).not.toHaveBeenCalled();
  });

  it("ignores episode.link — derives URL from title regardless of link value", async () => {
    vi.mocked(safeFetch).mockResolvedValue(banklessFixture);
    const ctx = makeCtx(
      "MegaETH Token Launch with Co-founders Shuyao and Lei",
      "https://some-other-host.com/episode/123",
    );
    const result = await banklessExtractor.extract(ctx);
    // URL is title-derived, not link-derived
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      "https://www.bankless.com/podcast/megaeth-token-launch-with-co-founders-shuyao-and-lei",
      expect.anything(),
    );
    expect(result).toBeTruthy();
  });

  it("truncates text exceeding MAX_TRANSCRIPT_LENGTH and appends marker", async () => {
    const longContent =
      '<div id="insideEpisode"><strong>TRANSCRIPT</strong><p>' +
      "x".repeat(60000) +
      "</p></div>";
    vi.mocked(safeFetch).mockResolvedValue(longContent);
    const result = await banklessExtractor.extract(makeCtx("Some Episode"));
    expect(result).toBeDefined();
    expect(result!.endsWith("[Transcript truncated...]")).toBe(true);
    // 50000 chars + "\n\n[Transcript truncated...]" (26 chars) = 50026
    expect(result!.length).toBe(50000 + "\n\n[Transcript truncated...]".length);
  });
});
