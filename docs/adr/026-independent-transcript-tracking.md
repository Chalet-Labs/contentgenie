# ADR-026: Independent Transcript Tracking Columns

**Status:** Accepted
**Date:** 2026-03-20
**Issue:** [#214](https://github.com/Chalet-Labs/contentgenie/issues/214)

## Context

Transcript state is currently implicit: `episodes.transcription` is either `NULL` or populated, and `summaryStatus` conflates transcript and summary progress into a single enum. This creates several problems:

1. **No way to distinguish "never attempted" from "attempted and failed"** — both result in `transcription IS NULL`.
2. **No independent retry** — a transcript failure forces the entire summarization to be re-run to retry just the transcript acquisition.
3. **No error tracking** — when transcript fetching fails, the error is only in Trigger.dev logs, not queryable from the database.
4. **No timestamp** — we can't tell when a transcript was fetched vs. when the summary completed.

The `transcriptSource` column was defined in `schema.ts` in a prior commit with values `"podcastindex" | "assemblyai" | "description-url"`, but neither the column nor its CHECK constraint were present in the database — they were missing from snapshot 0011 and no migration had been generated for them. Migration 0012 (this PR) materializes both in the database alongside the new transcript tracking columns.

## Decision

Add three new columns to the `episodes` table:

| Column | Type | Purpose |
|--------|------|---------|
| `transcript_status` | `text` (CHECK: `missing`, `fetching`, `available`, `failed`) | Independent lifecycle tracking for transcript acquisition |
| `transcript_fetched_at` | `timestamp` | When the transcript was successfully fetched |
| `transcript_error` | `text` | Last error message from a failed transcript fetch |

### Design choices

1. **Text + `$type<>` + CHECK** (not `pgEnum`) — consistent with all other enum-like columns in this schema (`summaryStatus`, `source`, `provider`). Easier to add values without a migration.

2. **`transcriptStatus` is nullable** — `NULL` means "never processed" (episode stub created but no summarization run yet). This distinguishes from `"missing"` (all sources attempted, none had a transcript).

3. **`transcriptSource` is NOT modified** — the issue spec mentions adding `"none"`, but `transcriptStatus = "missing"` already captures "no transcript acquired." Adding `"none"` to `transcriptSource` would be redundant and would require backfilling historical NULL values with a false assertion ("all sources tried and failed" when we actually don't know).

4. **Backfill via appended SQL in the generated migration** — `drizzle-kit generate` produces the DDL; we append UPDATE statements after the `statement-breakpoint` delimiter. Preview deploys use `drizzle-kit push` (which doesn't run migration files), but column defaults handle new inserts. Backfill is a one-time production concern.

5. **`persistTranscript` owns all transcript columns** — ~~the pipeline is `persistTranscript` (early, at actual fetch time) → `persistEpisodeSummary` (later, at summary completion time). Only `persistTranscript` sets `transcriptFetchedAt` because it captures the real fetch timestamp. `persistEpisodeSummary` sets `transcriptStatus` and `transcriptError` but must NOT overwrite `transcriptFetchedAt`.~~ **Superseded by [ADR-027](027-summarize-episode-pure-consumer.md):** `persistEpisodeSummary` no longer writes any transcript columns. `persistTranscript` is the sole writer of all transcript columns (`transcription`, `transcriptSource`, `transcriptStatus`, `transcriptFetchedAt`, `transcriptError`).

## Consequences

- Migration 0012 will add `transcript_status`, `transcript_fetched_at`, `transcript_error` columns and a CHECK constraint for `transcript_status`.
- The `transcript_source` column and `transcript_source_enum` CHECK constraint (previously defined only in schema.ts, not in any migration) are materialized in the database by migration 0012 alongside the new columns.
- Production requires manual `drizzle-kit push` after merge — same as every schema change (see `worth_it_reason` incident).
- The `TranscriptStatus` type export enables downstream consumers (future UI, API routes) to use the new column safely.
- No UI changes in this PR — the episode page already reads `transcriptSource` and will continue to work. Future PRs can use `transcriptStatus` for richer UI states.
