import { linkSuffixExtractor } from "@/trigger/helpers/transcript-extractors/link-suffix";
import type { Extractor } from "@/trigger/helpers/transcript-extractors/types";

// Lex Fridman Podcast — PodcastIndex feed:
// https://podcastindex.org/podcast/745287
export const LEX_FRIDMAN_PODCAST_INDEX_ID = "745287";

export const lexFridmanExtractor: Extractor = linkSuffixExtractor({
  id: "lex-fridman",
  suffix: "-transcript",
  replaceTrailingSlash: true,
});
