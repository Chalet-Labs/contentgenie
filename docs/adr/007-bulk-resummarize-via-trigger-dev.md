# ADR-007: Bulk Re-Summarization via Trigger.dev Parent Task

**Status:** Proposed
**Date:** 2026-02-17
**Issue:** [#38](https://github.com/Chalet-Labs/contentgenie/issues/38)

## Context

Users and administrators want to re-summarize episodes that already have summaries -- for example, after improving the AI prompt, upgrading the model, or fixing a summarization bug. The existing `summarize-episode` task handles single-episode summarization with retry, transcription fallback, and database persistence. The existing `batch-summarize-episodes` task fans out to `summarize-episode` via `batchTriggerAndWait` for a small set of episodes (max 20) passed from the UI.

Issue #38 requires a new capability: querying the database for episodes matching filter criteria (by podcast, date range, score threshold, or all episodes) and re-triggering summarization for potentially hundreds of episodes. This is fundamentally different from the existing batch summarize flow because:

1. **Scale:** Existing batch summarize handles up to 20 episodes selected by the user. Bulk re-summarize could target hundreds or thousands.
2. **Source of truth:** Existing batch summarize receives episode IDs from the client. Bulk re-summarize queries the database server-side based on filter criteria.
3. **Duration:** Processing hundreds of episodes through transcription + AI summarization could take 30+ minutes, far exceeding the 300-second `maxDuration`.

## Options Considered

### Option A: Reuse `batch-summarize-episodes` with larger batches

Increase the max batch size and call the existing task from a new API route that queries episodes server-side.

- **Pro:** Minimal new code. Reuses proven fan-out pattern.
- **Con:** `batchTriggerAndWait` blocks the parent task until ALL children complete. With 300s `maxDuration`, the parent would time out long before hundreds of summarizations finish. The parent task's purpose (wait and aggregate results) doesn't match the bulk use case.

### Option B: Fire-and-forget `batchTrigger` from API route (no parent task)

Query episodes in the API route, call `summarizeEpisode.batchTrigger()` directly, and return immediately.

- **Pro:** Simplest implementation. No parent task needed. Leverages the `summarize-queue` concurrency limit (3) for natural backpressure.
- **Con:** No progress tracking. No cancellation (individual runs can be canceled but there's no "batch" concept). No way to see overall status. Doesn't meet the acceptance criteria for progress tracking and cancellation.

### Option C: Parent task with chunked `batchTriggerAndWait` + `metadata.root.increment` for progress (chosen)

A Trigger.dev parent task that:
1. Queries the database for matching episodes.
2. Initializes progress metadata: `metadata.set("progress", { total, completed: 0, failed: 0, ... })`.
3. Chunks episode IDs (max 500 per `batchTriggerAndWait` call, the SDK limit).
4. Processes chunks sequentially via `batchTriggerAndWait`.
5. Child `summarize-episode` tasks call `metadata.root.increment("completed", 1)` on success and `metadata.root.increment("failed", 1)` on failure, providing **real-time per-episode progress** even while the parent is suspended.
6. After each chunk, the parent aggregates per-chunk results into a `failures` list.

- **Pro:** Uses the proven `batchTriggerAndWait` pattern. Real-time per-episode progress via `metadata.root.increment` (not just per-chunk). Cancellation via `runs.cancel` on the parent cascades to children. Per-child success/failure results from `batchTriggerAndWait`. The `summarize-queue` (concurrencyLimit: 3) provides natural backpressure.
- **Con:** Requires a small modification to `summarize-episode` (adding `metadata.root.increment` calls). Parent task blocks on each chunk. With `maxDuration: 3600` (1 hour max), very large bulk runs (1000+ episodes) may need narrower filters.

### Option D: Fire-and-forget `batchTrigger` + polling for progress

Parent task fires off all children via `batchTrigger` and polls `runs.retrieve` periodically.

- **Pro:** Parent doesn't block on children. Lighter-weight.
- **Con:** Polling logic is complex (exponential backoff, batch status aggregation). No per-child result data. `runs.retrieve` API calls consume quota. `batchTriggerAndWait` provides the same data for free.

## Decision

**Option C** -- Parent task with chunked `batchTriggerAndWait` and `metadata.root.increment` for real-time progress.

### Key design decisions

1. **Chunked `batchTriggerAndWait` with `metadata.root.increment`.** The parent fans out in chunks (up to 500 items per call, the SDK limit). While the parent is suspended during `batchTriggerAndWait`, child tasks push real-time progress via `metadata.root.increment("completed", 1)` and `metadata.root.increment("failed", 1)`. This gives the UI per-episode updates, not just per-chunk updates. After each chunk returns, the parent aggregates failure details.

2. **No `idempotencyKey` on `batchTriggerAndWait` items.** There is a known bug in Trigger.dev SDK v3.3.0 where `idempotencyKey` + `batchTriggerAndWait` can cause the parent to get stuck. The existing database-level guard (`processedAt IS NOT NULL` check in the episode query + `ON CONFLICT` in `persistEpisodeSummary`) provides equivalent deduplication protection.

3. **Episode query happens in the Trigger.dev task, not the API route.** Unlike the existing batch-summarize flow (where the client picks episode IDs), bulk re-summarize uses server-side filters. The API route validates auth + filters and passes them as the task payload. The task queries the database because: (a) the query could return thousands of rows -- too large for a payload, and (b) the task needs the latest data at execution time, not at trigger time.

4. **Existing `summarize-episode` is modified minimally.** Two lines are added at the end of `run()` and in `onFailure`:
   - `run()`: `metadata.root.increment("completed", 1)` after `metadata.set("step", "completed")`.
   - `onFailure`: `metadata.root.increment("failed", 1)` after the DB status update.
   These are no-ops when the task runs standalone (no root task context). When called from the bulk parent, they provide real-time progress.

5. **Cancellation via `runs.cancel`.** The API exposes a cancel endpoint that calls `runs.cancel(runId)`. When a parent task is canceled, Trigger.dev automatically cancels all in-progress child runs. Note: running children only stop at their next await/checkpoint, so an active AssemblyAI transcription may take minutes to abort.

6. **Dynamic public access token expiry.** The API route scales the `expirationTime` based on expected processing time: `Math.max(15, Math.ceil(estimatedEpisodes / 3 * 2))` minutes, capped at 60 minutes. This prevents token expiry during long-running bulk operations (the default 15m token from the existing pattern would expire for batches >~20 episodes).

7. **Filter criteria are validated in the API route.** The supported filters are:
   - `podcastId` (optional): Re-summarize episodes for a specific podcast.
   - `minDate` / `maxDate` (optional): Date range for episode `publishDate`.
   - `maxScore` (optional): Only episodes with `worthItScore` <= threshold (re-summarize low-quality summaries).
   - Require at least one filter OR explicit `all: true` to prevent accidental full re-summarization.

8. **No new database tables.** Bulk run metadata (runId, status, filters, progress) is tracked entirely in Trigger.dev's run metadata. The episodes table's existing `summaryStatus` and `summaryRunId` fields track per-episode status.

9. **Rate limiting.** A dedicated rate limit (`createRateLimitChecker` from ADR-001) with 1 bulk run per user per hour prevents abuse. The `bulk-resummarize-queue` concurrencyLimit of 1 provides a global guard.

10. **UI in settings page.** The bulk re-summarize controls are added to the existing settings page as a new card section. This is an admin-level action, not something users need on every page. The UI follows the `BatchSummarizeButton` and `OpmlImportForm` patterns.

## Consequences

- A new Trigger.dev task (`bulk-resummarize`) with `maxDuration: 3600` is added. This is the longest-running task in the project.
- The existing `summarize-episode` task gains two `metadata.root.increment` calls (no-ops when running standalone). This is a minor change that improves observability for all parent-child relationships.
- The `summarize-queue` concurrency limit (3) applies globally -- if a bulk run is in progress, ad-hoc single summarizations will queue behind it. This is acceptable because the queue fairly interleaves work.
- For very large datasets (1000+ episodes), the 1-hour `maxDuration` may not suffice. The task logs progress, so users can re-trigger with narrower filters to continue where it left off. Already-completed summaries are persisted and won't be re-queried.
