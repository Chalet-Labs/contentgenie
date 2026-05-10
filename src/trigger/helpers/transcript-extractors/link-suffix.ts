import { safeFetch } from "@/lib/security";
import {
  FETCH_TIMEOUT_MS,
  MAX_TRANSCRIPT_LENGTH,
  stripHtmlTranscript,
} from "@/trigger/helpers/transcript";
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
      const url = base + opts.suffix;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      let raw: string;
      try {
        raw = await safeFetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }

      let text = stripHtmlTranscript(raw).trim();
      if (!text) return undefined;
      if (text.length > MAX_TRANSCRIPT_LENGTH) {
        text =
          text.slice(0, MAX_TRANSCRIPT_LENGTH) +
          "\n\n[Transcript truncated...]";
      }
      return text;
    },
  };
}
