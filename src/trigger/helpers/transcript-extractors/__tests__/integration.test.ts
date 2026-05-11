import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/security", () => ({ safeFetch: vi.fn() }));

import { safeFetch } from "@/lib/security";
import {
  register,
  runPodcastExtractor,
  __resetRegistry,
} from "@/trigger/helpers/transcript-extractors";
import {
  BANKLESS_PODCAST_INDEX_ID,
  banklessExtractor,
} from "@/trigger/helpers/transcript-extractors/bankless";
import {
  LEX_FRIDMAN_PODCAST_INDEX_ID,
  lexFridmanExtractor,
} from "@/trigger/helpers/transcript-extractors/lex-fridman";
import {
  LIMITLESS_PODCAST_INDEX_ID,
  limitlessExtractor,
} from "@/trigger/helpers/transcript-extractors/limitless";
import type { ExtractorContext } from "@/trigger/helpers/transcript-extractors/types";

const banklessHtml =
  '<div id="insideEpisode"><strong>TRANSCRIPT</strong><p>Host: Hello world.</p></div>';

const makeCtx = (
  podcastIndexId: string,
  link: string | null = "https://example.com/episode/",
): ExtractorContext => ({
  episode: {
    podcastIndexId: "ep1",
    title: "Some Episode Title",
    link,
    rssGuid: null,
  },
  podcast: { podcastIndexId, title: "Some Podcast" },
});

beforeEach(() => {
  __resetRegistry();
  register(LEX_FRIDMAN_PODCAST_INDEX_ID, lexFridmanExtractor);
  register(LIMITLESS_PODCAST_INDEX_ID, limitlessExtractor);
  register(BANKLESS_PODCAST_INDEX_ID, banklessExtractor);
  vi.clearAllMocks();
  vi.mocked(safeFetch).mockResolvedValue(banklessHtml);
});

describe("registry wiring (VERIFY 5: registrations against correct podcastIndexId)", () => {
  it.each([
    [LEX_FRIDMAN_PODCAST_INDEX_ID, "lex-fridman"],
    [LIMITLESS_PODCAST_INDEX_ID, "limitless"],
    [BANKLESS_PODCAST_INDEX_ID, "bankless"],
  ])(
    "podcastIndexId %s dispatches to extractor id %s",
    async (id, expectedExtractorId) => {
      const result = await runPodcastExtractor(makeCtx(id));
      expect(result?.extractorId).toBe(expectedExtractorId);
    },
  );

  it("returns undefined for an unregistered podcastIndexId", async () => {
    const result = await runPodcastExtractor(makeCtx("999999999"));
    expect(result).toBeUndefined();
  });

  it("converts extractor throws to undefined (VERIFY 4 — registry catches fetch errors)", async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error("HTTP 404"));
    const result = await runPodcastExtractor(
      makeCtx(BANKLESS_PODCAST_INDEX_ID),
    );
    expect(result).toBeUndefined();
  });
});
