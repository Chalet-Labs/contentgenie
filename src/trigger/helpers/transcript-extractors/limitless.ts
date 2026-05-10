import { linkSuffixExtractor } from "@/trigger/helpers/transcript-extractors/link-suffix";
import type { Extractor } from "@/trigger/helpers/transcript-extractors/types";

export const LIMITLESS_PODCAST_INDEX_ID = "7326914";

export const limitlessExtractor: Extractor = linkSuffixExtractor({
  id: "limitless",
  suffix: "/transcript",
});
