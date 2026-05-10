import { fetchTranscriptFromUrl } from "@/trigger/helpers/transcript";
import type { Extractor, ExtractorContext } from "./types";

interface LinkSuffixOptions {
  id: string;
  suffix: string;
  replaceTrailingSlash?: boolean;
}

export function linkSuffixExtractor(opts: LinkSuffixOptions): Extractor {
  return {
    id: opts.id,
    extract: async (ctx: ExtractorContext) => {
      if (!ctx.episode.link) return undefined;

      const base =
        opts.replaceTrailingSlash && ctx.episode.link.endsWith("/")
          ? ctx.episode.link.slice(0, -1)
          : ctx.episode.link;
      return fetchTranscriptFromUrl(base + opts.suffix);
    },
  };
}
