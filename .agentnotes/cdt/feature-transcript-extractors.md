# Branch: feature/transcript-extractors

**Created**: 2026-05-10
**First plan**: .dev/cdt/plans/plan-20260510-1756.md

---

## Session 20260510-1817

**Task**: 428 — feat: Bankless, Lex Fridman, Limitless transcript extractors
**Plan**: .dev/cdt/plans/plan-20260510-1756.md

### What's Done

Three concrete transcript extractors implemented + registered against the #459 scaffolding (Lex Fridman + Limitless via `linkSuffixExtractor`, Bankless bespoke with verified anchor-pair narrowing). 95+ tests across 7 files green; full repo 3278 passed; coverage on extractor submodule ≥80%. Pre-PR multi-tool review (8 specialists + Codex) ran on the first commit and surfaced 1 P2 correctness bug (Codex: heading-only marker section returned the literal "TRANSCRIPT" string), 2 §5 in-PR duplication-extraction findings, 1 regex correctness issue (`id="insideEpisodeFoo"` prefix-match), 1 missing-test gap (registry → extractor wiring), tautological fixture roundtrip tests, and several mechanical comment/style nits — all addressed in a follow-up review-fixes commit before the PR opened.

### Open Questions

- The Bankless container regex `<div\s+id=["']?insideEpisode\b["']?[^>]*>` now uses a `\b` after `insideEpisode` to reject prefix-matches like `id="insideEpisodeFoo"`. The end-anchor regex was tightened to anchor on the `<tag` boundary so the scoped slice doesn't end mid-tag. Both changes are validated by the new boundary tests; if Bankless ever switches to multi-attribute markup (e.g., `class="foo postSidebar"`), the end-anchor would miss and we'd fall through to `<\/article>` / `<aside`. Worth re-validating against 2–3 more live episodes before #429 wires the pipeline.
- `bankless.ts` empty-body branch: the original "defensive guard" was unreachable (the marker text "TRANSCRIPT" always survived stripping). After slicing past the marker (Codex P2 fix), the guard is now meaningful — it catches genuinely empty post-marker sections. No log added; the registry's outer `logger.warn` covers diagnostic visibility for any throw, and an empty-body return is a normal "no transcript" signal.

### Context for Next Session

- #429 integrates this registry into `src/trigger/fetch-transcript.ts`. The dispatcher is `runPodcastExtractor(ctx)` from `src/trigger/helpers/transcript-extractors/index.ts`; it returns `{ transcript, extractorId } | undefined`. Keys off `ctx.podcast.podcastIndexId`. Per the #459 scaffolding contract, the dispatcher catches extractor throws and converts them to `undefined`, so `fetch-transcript.ts` only needs to handle the success/fallthrough cases.
- Bankless uses `episode.title` (not `episode.link`) to derive the URL, unlike Lex/Limitless which use `episode.link + suffix`. The integration in #429 needs to pass full `ExtractorContext` including `title` — see `src/trigger/helpers/transcript-extractors/types.ts:1-9`.
- `safeFetchWithTimeout` and `truncateTranscript` are now exported from `src/trigger/helpers/transcript.ts` and reused across `fetchTranscript`, `fetchTranscriptFromUrl`, and `banklessExtractor`. Future extractors should use these helpers rather than recreating the abort/timeout/truncation pattern.
- PodcastIndex feed IDs are hard-coded as string consts (`*_PODCAST_INDEX_ID`) in each extractor file. If a podcast is re-imported with a different feed source, the registry key won't match — IDs may need updating in those files.

### References

- PR: https://github.com/Chalet-Labs/contentgenie/pull/461
