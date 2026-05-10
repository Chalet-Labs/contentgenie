import {
  safeFetchWithTimeout,
  stripHtmlTranscript,
  truncateTranscript,
} from "@/trigger/helpers/transcript";
import type {
  Extractor,
  ExtractorContext,
} from "@/trigger/helpers/transcript-extractors/types";

export const BANKLESS_PODCAST_INDEX_ID = "357756";

/**
 * Convert a Bankless episode title into the URL slug used by bankless.com/podcast/.
 *
 * Verified empirically against five live episode URLs (2026-05-10): apostrophes
 * are dropped (NOT hyphenated) — `Bitcoin's` → `bitcoins`, NOT `bitcoin-s`. This
 * differs from `src/lib/utils.ts` `slugify`, which is why we keep a site-specific
 * rule here rather than reusing the generic helper.
 */
export function banklessSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/['‘’"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CONTAINER_RE = /<div\b[^>]*?\bid=["']?insideEpisode\b/i;
const MARKER_RE = /<strong>\s*TRANSCRIPT\s*<\/strong>/i;
const END_ANCHOR_RE =
  /<\w+\s+[^>]*?class=["']?[^"'>]*?\b(?:postSidebar|rule)\b|<\/article>|<aside\b|<footer\b/i;

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
 * The body is sliced from immediately *after* the marker, so a heading-only
 * section returns undefined rather than the literal word "TRANSCRIPT" (which
 * would mask fallback to other transcript sources).
 *
 * The end of the transcript is bounded by the next post-content sibling
 * (`postSidebar`, `rule`, `</article>`, `<aside`, `<footer`) to avoid bleeding
 * into "next episode" / sidebar markup.
 *
 * Fetch errors propagate; the registry (`runPodcastExtractor`) catches them
 * and converts to `undefined` per the scaffolding contract from #459.
 */
export const banklessExtractor: Extractor = {
  id: "bankless",
  extract: async (ctx: ExtractorContext): Promise<string | undefined> => {
    const title = ctx.episode.title?.trim();
    if (!title) return undefined;

    const slug = banklessSlug(title);
    if (!slug) return undefined;

    const url = `https://www.bankless.com/podcast/${slug}`;
    const html = await safeFetchWithTimeout(url);

    const containerStart = html.search(CONTAINER_RE);
    if (containerStart === -1) return undefined;

    const rawInside = html.slice(containerStart);
    const containerEnd = rawInside.search(END_ANCHOR_RE);
    const inside =
      containerEnd === -1 ? rawInside : rawInside.slice(0, containerEnd);
    const markerMatch = MARKER_RE.exec(inside);
    if (!markerMatch) return undefined;

    const fromBody = inside.slice(markerMatch.index + markerMatch[0].length);
    const endIdx = fromBody.search(END_ANCHOR_RE);
    const scoped = endIdx === -1 ? fromBody : fromBody.slice(0, endIdx);

    const text = stripHtmlTranscript(scoped).trim();
    if (!text) return undefined;

    return truncateTranscript(text);
  },
};
