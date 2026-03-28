# ADR-029: Persist Trigger.dev Run IDs for Realtime Reconnection

**Status:** Accepted
**Date:** 2026-03-28
**Issue:** [#238](https://github.com/Chalet-Labs/contentgenie/issues/238)

## Context

The `EpisodeActionButtons` component (admin episodes table) and the episode page (`/episode/[id]`) both use `useRealtimeRun` to subscribe to in-flight Trigger.dev runs. When the user navigates away and returns while a run is still in progress, the component has no `runId` or `accessToken` to reattach the realtime subscription.

**Current mitigation:** A mount-time recovery effect calls `getEpisodeStatus()` to check whether the status is still in-progress. If it is, the UI shows a spinner but cannot subscribe to realtime updates — the user sees a stuck loading state until either:
1. The staleness timeout fires (20min transcript, 10min summary), or
2. The user manually refreshes after the run completes.

**Root cause:** The `summaryRunId` column already exists on the `episodes` table and is used by the summary flow for exactly this reconnection pattern (see `summarize/route.ts` GET handler, lines 203-224). However, no equivalent `transcriptRunId` column exists, and neither the `fetch-transcript` API route nor the `getEpisodeStatus` server action return run IDs for reconnection.

The summary flow already demonstrates the correct pattern:
1. **On trigger:** Store `summaryRunId` in the DB (line 139, `summarize/route.ts`)
2. **On page load:** GET handler checks for in-progress run, reads `summaryRunId` from DB, generates a fresh `publicAccessToken`, and returns both (lines 203-224)
3. **On completion:** `persistEpisodeSummary` clears `summaryRunId` to null (line 162, `database.ts`)

The transcript flow is missing steps 1 and 2.

## Decision

Extend the existing summary reconnection pattern to the transcript flow:

### 1. Schema: Add `transcriptRunId` column

Add `transcriptRunId: text("transcript_run_id")` to the `episodes` table. Nullable, no default. Mirrors `summaryRunId`.

No CHECK constraint needed — run IDs are opaque strings from Trigger.dev.

### 2. API route: Store `transcriptRunId` on trigger

In `fetch-transcript/route.ts`, store `transcriptRunId: handle.id` after `tasks.trigger()` returns. The optimistic `transcriptStatus: "fetching"` update runs before the trigger call (so the UI gets immediate feedback), and the run ID is only available after the trigger returns — so this requires a second `db.update().set()` call with just `transcriptRunId: handle.id`.

### 3. Server action: Return run IDs for reconnection

Expand `getEpisodeStatus` to also return `summaryRunId` and `transcriptRunId` from the DB. The action already queries the episode row; this adds two columns to the `columns` selection.

### 4. Server action: Add `getRunReconnectionData`

Add a new server action that, given an episode ID and run type (`"transcript"` | `"summary"`), returns `{ runId, publicAccessToken }` by:
1. Reading the appropriate `*RunId` column from the DB
2. Generating a fresh `publicAccessToken` via `auth.createPublicToken`

This is separated from `getEpisodeStatus` because token generation is a Trigger.dev SDK call that can fail independently and should not block status checks.

### 5. Client: Reconnect on mount

In `EpisodeActionButtons`, the existing mount-time recovery effect already detects in-progress states. When it finds one, it calls `getRunReconnectionData` to get a `runId` + `publicAccessToken`, then sets them on the existing `useRealtimeRun` hooks. No new hooks needed.

### 6. Task completion: Clear `transcriptRunId`

Clear `transcriptRunId` unconditionally at the end of the `fetch-transcript` task's `run` function, after the `persistTranscript` conditional. This covers all completion paths:
- **Transcript found + persisted:** `persistTranscript` writes `transcriptStatus: "available"`, then the unconditional clear removes the run ID.
- **No transcript found:** `persistTranscript` is skipped (task returns `{ transcript: undefined, source: null }`), but the run ID is still cleared.

Additionally, add an `onFailure` handler to clear the run ID when the task crashes before reaching the end of `run`. Both clears are wrapped in try/catch — they are non-critical and should not fail the task or the failure handler.

### Design choices

1. **Reuse existing pattern, not a new mechanism.** The summary flow already stores `summaryRunId` and generates fresh tokens on reconnection. We replicate this pattern rather than inventing a new one (e.g., session storage, URL params, or a separate "runs" table).

2. **Separate `getRunReconnectionData` from `getEpisodeStatus`.** Token generation is a Trigger.dev API call that can fail or add latency. The status check is a simple DB read. Keeping them separate means mount-time recovery can first detect in-progress state (fast), then attempt reconnection (slower, can fail gracefully).

3. **No `runs.retrieve` reconciliation.** We considered adding a `runs.retrieve(runId)` call to check whether a DB-stored run ID corresponds to a run that already completed (stale DB state). This is unnecessary because: (a) the unconditional run ID clear at the end of `run` and the `onFailure` handler cover all normal termination paths, so stale state only occurs on infrastructure failures, and (b) `useRealtimeRun` will surface terminal states immediately when it reconnects to a completed run, handling this case at the client level.

4. **Column on `episodes`, not a separate table.** One run ID per flow per episode is sufficient. We never need to track multiple concurrent runs for the same episode+flow combination — the UI prevents this, and the API route would need to cancel the old run first.

## Consequences

- Migration: Add nullable `transcript_run_id` text column. Zero-risk DDL (nullable, no default, no constraint). Must run `db:push` on dev and production after merge.
- The `EpisodeTranscriptFetchButton` component on the episode page (`/episode/[id]`) still uses polling — this issue targets only the admin `EpisodeActionButtons`. A future PR can apply the same pattern to the episode page component.
- `getEpisodeStatus` return type expands to include optional `summaryRunId` and `transcriptRunId` fields. Existing consumers only destructure `transcriptStatus` and `summaryStatus`, so this is backward-compatible.
- `fetch-transcript` task gains an unconditional `transcriptRunId: null` write at the end of `run` and in an `onFailure` handler. This ensures the run ID is cleared on all termination paths (success, no-transcript, and crash).
