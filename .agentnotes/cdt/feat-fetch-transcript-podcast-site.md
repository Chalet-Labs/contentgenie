# Branch: feat/fetch-transcript-podcast-site

**Created**: 2026-05-11
**First plan**: .dev/cdt/plans/plan-20260511-1433.md

---

## Session 20260511-1452

**Task**: Integrate the podcast-site extractor registry into `src/trigger/fetch-transcript.ts` as a new Step 3 between PodcastIndex and description-URL; thread `transcript_extractor` through `persistTranscript`; cover with three Vitest cases (hit / miss / extractor-throw). Closes #429.
**Plan**: .dev/cdt/plans/plan-20260511-1433.md

### What's Done

PR #464 opened. Step 3 inserted in fetch-transcript.ts gated on Step 2 miss; lazy `db.query.episodes.findFirst({ with: { podcast: true } })` loads the `ExtractorContext` payload without widening `FetchTranscriptPayload`. `persistTranscript` gained optional 4th `extractorId?: string` with conditional spread. Tests: hit / miss / throw / orphaned-FK in fetch-transcript.test.ts plus two unit tests for the conditional spread in database.test.ts.

### Open Questions

- Conditional spread vs unconditional `extractorId ?? null` write in `persistTranscript` was a deliberate plan-time choice (plan L32) — Codex and one internal reviewer both proposed flipping it. Mitigation: documented the rationale inline (`src/trigger/helpers/database.ts:161-165`) so future readers see the constraint before changing it. If a "force re-fetch UX" lands later that needs to clear the column on supersession, that's the moment to revisit.
- Type-design reviewer suggested branding `extractorId` as `TranscriptExtractorId` (closed union derived from the registry). Deferred per checklist §7 — touches 5 files in `src/trigger/helpers/transcript-extractors/` (#428's scope) and the bug isn't introduced by this PR.

### Context for Next Session

- Pipeline order is now `cached → podcastindex → podcast-site → description-url → assemblyai` (5 steps). Inline `// Step N:` comments at `src/trigger/fetch-transcript.ts:65, 89, 114, 163, 189` are the source of truth — keep them renumbered if more steps are inserted.
- The Step 3 DB lookup is a **separate** `findFirst` from the Step 1 cache check by design — Step 1 stays a single-column lookup so the cache-hit fast path doesn't pay the podcast join cost. Reviewers consistently flag this as duplication; it's intentional.
- Test-side `stubStep3Lookup(row)` helper in `src/trigger/__tests__/fetch-transcript.test.ts` is the canonical way to stub the relational query; future Step-3-touching tests should reuse it instead of inlining `mockFindFirst.mockImplementation` branches.
- Pre-PR validation flagged 7 actionable findings across 9 reviewers; the second commit (`39b1290`) addresses all of them — see PR #464 commit history.

### References
- PR: https://github.com/Chalet-Labs/contentgenie/pull/464
