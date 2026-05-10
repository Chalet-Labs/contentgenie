# Branch: feat/transcript-source-podcast-site

**Created**: 2026-05-11
**First plan**: .dev/cdt/plans/plan-20260511-0054.md

---

## Session 20260511-0107

**Task**: Issue #430 — widen the `transcriptSource` TypeScript union to include `"podcast-site"` across admin queries, episode-detail API, and admin UI surfaces (follow-on to merged #426)
**Plan**: .dev/cdt/plans/plan-20260511-0054.md

### What's Done

Verification-only PR: added regression tests for `"podcast-site"` across episode-detail API, admin episodes table, and the `formatTranscriptSource` switch, plus a Storybook story for `TranscriptSourceCard`. Zero production code changes — PR #426 already cascaded the union widening through `text("transcript_source").$type<TranscriptSource>()` at `src/db/schema.ts:112`.

### Open Questions

_None — all acceptance criteria passed on first review cycle._

### Context for Next Session

- This branch's PR is forward-defense only. A future PR that re-narrows `transcriptSource` to a literal union excluding `"podcast-site"` will fail in `src/app/api/__tests__/episodes-id.test.ts:402`, `src/components/admin/episodes/__tests__/episodes-table.test.tsx:73`, `src/components/admin/overview/transcript-source-card.stories.tsx`, or `src/components/episodes/__tests__/episode-detail-shared.test.ts`. Evidence: PR #463 diff confirms no production source files changed.
- Pre-PR review caught a real gap in the plan: `formatTranscriptSource` at `src/components/episodes/episode-detail-shared.ts:49-62` was listed in the plan's narrowing-site survey as "Done" because the `case "podcast-site"` line exists, but had zero test coverage. Future plans that survey narrowing sites should treat "case-line exists" as separate from "regression-protected" — verify a test asserts the case before claiming coverage.
- Loose `string | null` typings on `EpisodeRow.transcriptSource` (`src/lib/admin/episode-queries.ts:20`) and `TranscriptSourceBreakdown.source` (`src/lib/admin/overview-queries.ts:15-18`) are intentional rendering DTOs and were explicitly excluded from scope per plan §Boundaries. Tightening them to `TranscriptSource | null` would require updating multiple `vi.mock` factories — defer until a future epic needs the tighter type.

### References
- PR: https://github.com/Chalet-Labs/contentgenie/pull/463
