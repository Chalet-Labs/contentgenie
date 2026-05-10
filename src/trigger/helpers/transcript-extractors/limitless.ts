import { linkSuffixExtractor } from "@/trigger/helpers/transcript-extractors/link-suffix";
import type { Extractor } from "@/trigger/helpers/transcript-extractors/types";

// Limitless Podcast — PodcastIndex feed:
// https://podcastindex.org/podcast/7326914
export const LIMITLESS_PODCAST_INDEX_ID = "7326914";

export const limitlessExtractor: Extractor = linkSuffixExtractor({
  id: "limitless",
  suffix: "/transcript",
});
