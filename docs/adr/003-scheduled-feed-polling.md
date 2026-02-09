# ADR-003: Scheduled Feed Polling via Trigger.dev

**Status:** Accepted
**Date:** 2026-02-09
**Issue:** [#24](https://github.com/Chalet-Labs/contentgenie/issues/24)

## Context

The dashboard (`getRecentEpisodesFromSubscriptions`) fans out PodcastIndex API calls to all subscribed podcasts at request time using `Promise.all`. Per-feed failures are silently swallowed, there are no retries, and users only see fresh episodes if they visit the dashboard.

Issue #18 proposed a cron API route (e.g., `/api/cron/poll-feeds` triggered by Vercel Cron) as part of the AssemblyAI epic (#13). This ADR documents the decision to use Trigger.dev scheduled tasks instead.

## Options Considered

### Option A: Vercel Cron + API Route

A `GET /api/cron/poll-feeds` route called by Vercel Cron on a schedule.

- **Pros:** Simple, no additional infrastructure, works with Vercel's built-in cron.
- **Cons:** No automatic retries. No structured logging or run dashboard. 10-second timeout on Hobby plan (60s on Pro) limits the number of feeds that can be polled. No concurrency control. No visibility into individual run status. Must implement own error tracking.

### Option B: Trigger.dev `schedules.task` (chosen)

A `schedules.task` with a declarative cron expression, running on Trigger.dev Cloud infrastructure.

- **Pros:** Automatic retries with exponential backoff. 300-second max duration (configurable). Built-in structured logging visible in dashboard. Per-run metadata and status tracking. `retry.onThrow` for per-feed error isolation. Can trigger child tasks (`summarize-episode`) natively. Concurrency control via queues. Already integrated for summarization (#21).
- **Cons:** Additional dependency on Trigger.dev Cloud. Counts toward run quota. Cron schedule syncs at deploy time (not runtime-configurable).

### Option C: Fan-out to per-feed child tasks

Instead of polling all feeds in a single scheduled run, fan out each feed to its own child task via `batchTriggerAndWait`.

- **Pros:** Per-feed retries handled by Trigger.dev. Per-feed visibility in dashboard. Natural isolation.
- **Cons:** Higher overhead (N task runs per poll cycle instead of 1). More complex orchestration. Overkill for the current scale (~10-50 feeds).

## Decision

**Option B** — Trigger.dev `schedules.task` with sequential in-task polling.

Within the task, feeds are polled sequentially with `retry.onThrow` for per-feed retries and try/catch for error isolation. New episodes are dispatched to `summarize-episode` via `batchTrigger` (fire-and-forget) rather than `batchTriggerAndWait`, since the poll task doesn't need to wait for summarizations to complete.

### Additional decisions

- **Fire-and-forget triggering:** `summarizeEpisode.batchTrigger()` is used instead of `batchTriggerAndWait()` because polling should complete quickly. Summarization runs independently with its own retry/queue config.
- **No shared dedup helper:** The episode deduplication logic (~10 lines) is duplicated between the scheduled task and the `refreshPodcastFeed` server action. This avoids cross-runtime import issues (Trigger.dev runtime vs. Next.js server) and keeps each module self-contained. If a third consumer appears, extraction would be warranted.
- **RSS podcast exclusion:** Podcasts with `source = 'rss'` are filtered out because their synthetic `podcastIndexId` values (e.g., `rss-<hex>`) are not valid PodcastIndex feed IDs.

## Consequences

- Issue #18's cron API route approach is superseded. #18 should be closed or updated to reference this implementation.
- Feed polling runs every 2 hours on Trigger.dev Cloud, independent of user visits.
- If Trigger.dev is unavailable, polling stops but the app continues to function (graceful degradation).
- If feed count grows beyond ~150, the 300-second `maxDuration` may become a bottleneck. At that point, Option C (fan-out) should be reconsidered.
