import { safeFetch } from "@/lib/security";
import {
  FETCH_TIMEOUT_MS,
  MAX_TRANSCRIPT_LENGTH,
  stripHtmlTranscript,
} from "@/trigger/helpers/transcript";
import type {
  Extractor,
  ExtractorContext,
} from "@/trigger/helpers/transcript-extractors/types";

// Bankless Podcast — PodcastIndex feed:
// https://podcastindex.org/podcast/357756
export const BANKLESS_PODCAST_INDEX_ID = "357756";

/**
 * Convert a Bankless episode title into the URL slug used by bankless.com/podcast/.
 *
 * Verified empirically against five live episode URLs (2026-05-10): apostrophes
 * are dropped (NOT hyphenated) — `Bitcoin's` → `bitcoins`, NOT `bitcoin-s`. This
 * differs from `src/lib/utils.ts` `slugify`, which is why we keep a site-specific
 * rule here rather than reusing the generic helper.
 *
 * Rule:
 *   1. NFKD normalize + strip combining marks.
 *   2. Lowercase.
 *   3. Strip apostrophes / curly quotes / straight double quotes.
 *   4. Replace runs of any non-`[a-z0-9]` characters with a single hyphen.
 *   5. Trim leading/trailing hyphens.
 */
export function banklessSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['‘’"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Bankless extractor — fetches the episode page, narrows to the transcript
 * section by the verified anchor pair, and returns clean text.
 *
 * Anchors (verified verbatim 2026-05-10 against
 * https://www.bankless.com/podcast/megaeth-token-launch-with-co-founders-shuyao-and-lei):
 *   - Container: `<div id="insideEpisode">`
 *   - Marker:    `<strong>TRANSCRIPT</strong>`
 * Both must be present, in order. Either missing → returns undefined.
 *
 * The end of the transcript is bounded by the next post-content sibling
 * (`postSidebar`, `rule`, `</article>`, `<aside`, `<footer`) to avoid bleeding
 * into "next episode" / sidebar markup.
 */
export const banklessExtractor: Extractor = {
  id: "bankless",
  extract: async (ctx: ExtractorContext): Promise<string | undefined> => {
    const title = ctx.episode.title?.trim();
    if (!title) return undefined;

    const slug = banklessSlug(title);
    if (!slug) return undefined;

    const url = `https://www.bankless.com/podcast/${slug}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html: string;
    try {
      html = await safeFetch(url, { signal: controller.signal });
    } catch {
      // safeFetch throws on non-2xx (security.ts:263–265) and on abort/network errors.
      // Issue #428 requires undefined-on-error rather than throwing.
      return undefined;
    } finally {
      clearTimeout(timeout);
    }

    const containerStart = html.search(
      /<div\s+id=["']?insideEpisode["']?[^>]*>/i,
    );
    if (containerStart === -1) return undefined;

    const inside = html.slice(containerStart);
    const markerStart = inside.search(/<strong>\s*TRANSCRIPT\s*<\/strong>/i);
    if (markerStart === -1) return undefined;

    const fromMarker = inside.slice(markerStart);
    const endIdx = fromMarker.search(
      /class=["']?(?:postSidebar|rule)\b|<\/article>|<aside\b|<footer\b/i,
    );
    const scoped = endIdx === -1 ? fromMarker : fromMarker.slice(0, endIdx);

    const text = stripHtmlTranscript(scoped).trim();
    // Defensive: the <strong>TRANSCRIPT</strong> marker always contributes its
    // text node, so `text` is never empty in practice with the current anchor
    // design. Guard retained for future anchor changes.
    if (!text) return undefined;

    return text.length > MAX_TRANSCRIPT_LENGTH
      ? text.slice(0, MAX_TRANSCRIPT_LENGTH) + "\n\n[Transcript truncated...]"
      : text;
  },
};
