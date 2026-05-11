# Branch: feat/fetch-transcript-podcast-site

**Created**: 2026-05-11
**First plan**: .dev/cdt/plans/plan-20260511-1433.md

---

## Session 20260511-1452

**Task**: Integrate the podcast-site extractor registry into `src/trigger/fetch-transcript.ts` as a new Step 3 between PodcastIndex and description-URL; thread `transcript_extractor` through `persistTranscript`; cover with three Vitest cases (hit / miss / extractor-throw). Closes #429.
**Plan**: .dev/cdt/plans/plan-20260511-1433.md

### What's Done

PR #464 opened. Step 3 inserted in fetch-transcript.ts gated on Step 2 miss; lazy `db.query.episodes.findFirst({ with: { podcast: true } })` loads the `ExtractorContext` payload without widening `FetchTranscriptPayload`. `persistTranscript` gained optional 4th `extractorId?: string` and always writes `transcript_extractor` (set when `source === "podcast-site"`, cleared to `null` otherwise) so the column never carries stale provenance across a `force=true` re-fetch. Tests: hit / miss / throw / orphaned-FK in fetch-transcript.test.ts plus four unit tests in database.test.ts covering the always-clear behavior (podcast-site with/without extractorId, non-podcast-site source, and stale-clearing on re-fetch).

### Open Questions

- Initial plan-time decision (plan L32) used a conditional spread to defer column clearing to a future "force re-fetch UX". Three reviewers (Codex P2, internal code-reviewer, then gemini-code-assist on PR) flagged the stale-provenance bug on `force=true` re-fetch by a different source. Reversed in commit 9c9a1d5 — now `transcript_extractor` always reflects the current source's provenance via an unconditional ternary.
- Type-design reviewer suggested branding `extractorId` as `TranscriptExtractorId` (closed union derived from the registry). Deferred per checklist §7 — touches 5 files in `src/trigger/helpers/transcript-extractors/` (#428's scope) and the bug isn't introduced by this PR.

### Context for Next Session

- Pipeline order is now `cached → podcastindex → podcast-site → description-url → assemblyai` (5 steps). Inline `// Step N:` comments at `src/trigger/fetch-transcript.ts:65, 89, 114, 163, 189` are the source of truth — keep them renumbered if more steps are inserted.
- The Step 3 DB lookup is a **separate** `findFirst` from the Step 1 cache check by design — Step 1 stays a single-column lookup so the cache-hit fast path doesn't pay the podcast join cost. Reviewers consistently flag this as duplication; it's intentional.
- Test-side `stubStep3Lookup(row)` helper in `src/trigger/__tests__/fetch-transcript.test.ts` is the canonical way to stub the relational query; future Step-3-touching tests should reuse it instead of inlining `mockFindFirst.mockImplementation` branches.
- Pre-PR validation flagged 7 actionable findings across 9 reviewers; the second commit (`39b1290`) addresses all of them — see PR #464 commit history.

### References
- PR: https://github.com/Chalet-Labs/contentgenie/pull/464
