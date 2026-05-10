import { fetchTranscriptFromUrl } from "@/trigger/helpers/transcript";
import type {
  Extractor,
  ExtractorContext,
} from "@/trigger/helpers/transcript-extractors/types";

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

      const url = new URL(ctx.episode.link);
      const rawPath = url.pathname;
      const hasTrailingSlash = rawPath.endsWith("/") && rawPath.length > 1;
      const basePath =
        opts.replaceTrailingSlash && hasTrailingSlash
          ? rawPath.slice(0, -1)
          : rawPath;
      url.pathname =
        basePath === "/" && opts.suffix.startsWith("/")
          ? opts.suffix
          : basePath + opts.suffix;
      return fetchTranscriptFromUrl(url.href);
    },
  };
}
