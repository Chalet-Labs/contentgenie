# ADR-027: Make `summarize-episode` a Pure Consumer of Existing Transcripts

**Status:** Accepted
**Date:** 2026-03-21
**Issue:** [#215](https://github.com/Chalet-Labs/contentgenie/issues/215)
**Supersedes:** Transitional design from ADR-025 (fetch-transcript extraction)

---

## Context

After ADR-025 extracted `fetch-transcript` into its own Trigger.dev task, `summarize-episode` still orchestrated transcript acquisition by calling `fetchTranscriptTask.triggerAndWait(...)` inline. This created a waterfall: summarization could not start until transcript fetching completed, and the two tasks were still tightly coupled at runtime.

ADR-026 added independent `transcriptStatus` tracking, making `transcription` a first-class column owned by `fetch-transcript`. The remaining coupling in `summarize-episode` became dead code masquerading as a feature: if no transcript was available, it fell back to a description-only summary — a low-quality output that bypassed the requirement for a real transcript.

---

## Decision

`summarize-episode` is refactored to be a **pure consumer**: it reads the `transcription` column from the database and aborts if no transcript exists.

Key changes:

1. **Remove `fetchTranscriptTask.triggerAndWait`** from `summarize-episode`. Transcript acquisition is no longer orchestrated by the summarization pipeline.

2. **Abort on missing transcript** via `AbortTaskRunError`. Because `AbortTaskRunError` bypasses the `onFailure` hook, a `summaryStatus = "failed"` + `processingError` DB write is performed before throwing, wrapped in try/catch so the abort fires regardless of DB availability.

3. **`transcript` is now required** in `generateEpisodeSummary` and `getSummarizationPrompt`. The description-only fallback prompt branch is removed.

4. **`persistEpisodeSummary` simplified to 3 params**: `(episode, podcast, summary)`. Transcript-related column writes (`transcription`, `transcriptSource`, `transcriptStatus`, `transcriptError`, `transcriptFetchedAt`) are exclusively owned by `fetch-transcript` via `persistTranscript`.

5. **`"transcribing"` removed from `summaryStatus`**: the CHECK constraint, TypeScript type, and `IN_PROGRESS_STATUSES` array no longer include `"transcribing"`. That status was a transitional artifact — transcript progress is now tracked exclusively via `transcriptStatus`.

6. **`maxDuration` reduced from 7200s to 600s**: summarization itself takes ~10–30s; the 2-hour timeout was inherited from the era when it also waited for AssemblyAI.

---

## Consequences

**Callers must ensure `fetch-transcript` has completed before triggering `summarize-episode`.** The API route and admin re-summarize button both read transcript state before triggering summarization; they are responsible for surfacing the "no transcript" state to users rather than generating a low-quality fallback.

**Batch and bulk paths** (`bulk-resummarize`, `batch-summarize-episodes`) handle per-episode `AbortTaskRunError` failures gracefully: `batchTriggerAndWait` returns `ok: false` for aborted runs, which existing error-counting code already handles.

**Episodes with no transcript** will fail summarization with a clear `processingError` message rather than producing a description-only summary. This is the intended behavior: transcript is a hard requirement.

**Schema migration** (`0013_burly_rhino.sql`) drops and re-adds the `summary_status_enum` CHECK constraint without `'transcribing'`, and backfills any stale `transcribing` rows to `failed`.
