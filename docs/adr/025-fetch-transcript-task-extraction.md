# ADR-025: Extract `fetch-transcript` Trigger.dev Task

**Status:** Accepted
**Date:** 2026-03-20
**Issue:** [#213](https://github.com/Chalet-Labs/contentgenie/issues/213)

## Context

The `summarize-episode` Trigger.dev task contains a ~150-line transcript acquisition waterfall (lines 96–248) that:

1. Checks the DB cache for an existing transcription
2. Fetches from PodcastIndex transcripts API
3. Extracts a transcript URL from the episode description
4. Submits audio to AssemblyAI for async transcription (via `wait.createToken` + webhook)

This waterfall is inlined in `summarize-episode`, making it impossible to:
- Test transcript acquisition independently from summarization
- Reuse transcript fetching from other entry points (e.g., a future standalone transcript-refresh flow)
- Retry only the transcript fetch step without retrying the entire episode + podcast fetch pipeline

Additionally, the waterfall is the primary contributor to `summarize-episode`'s `maxDuration: 7200` requirement — needed solely for the AssemblyAI async webhook wait (up to 1.5 hours). The summarization step itself is fast (~10–30s).

## Options Considered

### Option A: Keep waterfall inline, extract as a plain async function

Extract the waterfall into a helper function (`fetchTranscriptForEpisode`) called from `summarize-episode`.

- **Pro:** No Trigger.dev infrastructure changes. No billing impact.
- **Con:** Single retry boundary — a transcript fetch failure still retries the full pipeline (episode fetch, podcast fetch, DB tracking). No independent observability in the Trigger.dev dashboard. Cannot be called from other entry points without the full `summarize-episode` context.

### Option B: Extract to standalone Trigger.dev task, wire via `triggerAndWait` (chosen)

Create a dedicated `fetch-transcript` Trigger.dev task that owns the entire waterfall. `summarize-episode` calls it via `fetchTranscriptTask.triggerAndWait(...)` and treats a permanent failure as "no transcript available" (non-fatal).

- **Pro:** Independent retry boundary — transcript failures retry only the transcript fetch, not episode/podcast fetch. Independent observability in the Trigger.dev dashboard (two run entries per summarization). Enables future callers (e.g., a standalone transcript-refresh endpoint). Co-locates transcript persistence with transcript acquisition for idempotency.
- **Con:** Slight billing increase (2 task runs per summarization instead of 1). Small latency overhead for task dispatch on the cached path (a few hundred ms). Two entries in the Trigger.dev dashboard per summarization run (increased noise).

## Decision

**Option B** — standalone `fetch-transcript` Trigger.dev task wired via `triggerAndWait`.

### Key design decisions

1. **Dedicated queue (`fetch-transcript-queue`), not `summarize-queue`.** With `concurrencyLimit: 3` on `summarize-queue`, three concurrent `summarize-episode` runs would hold all queue slots while awaiting their child `fetch-transcript` tasks — a guaranteed deadlock. A dedicated queue with no concurrency limit eliminates this entirely and allows independent scaling of transcript fetching.

2. **`fetch-transcript` persists the transcript before returning.** Persistence is non-fatal: if the DB write fails, the task still returns the transcript. This makes the task idempotent — a retry after a network blip won't lose a successfully fetched transcript. `persistEpisodeSummary` in `summarize-episode` will overwrite the same columns again immediately after; the second write is authoritative.

3. **Source mapping moves into `fetch-transcript`.** The `"cached"` → `undefined` / `"none"` → `null` sentinel mapping previously lived in `summarize-episode`. It now lives in `fetch-transcript`, co-located with the responsibility that generates those sentinels. `summarize-episode` receives a clean DB-safe type and passes it straight through to `persistEpisodeSummary`.

4. **`ok: false` on `triggerAndWait` is non-fatal.** If `fetch-transcript` permanently fails after its retries, `summarize-episode` treats it as "no transcript available" and continues to generate a summary without a transcript. This matches the existing non-fatal handling throughout the original waterfall.

5. **`force` flag in `FetchTranscriptPayload` for future callers.** `summarize-episode` always omits `force` (defaulting to `false`). The flag is additive — it does not change current behaviour and does not create a regression with the admin re-summarize button (which already reuses cached transcripts).

6. **`maxDuration: 7200` on `fetch-transcript`.** The AssemblyAI async webhook path requires up to 1.5 hours. `summarize-episode` no longer needs `maxDuration: 7200` for transcript reasons alone; it retains it for safety since it still orchestrates the overall pipeline.

## Consequences

- A new Trigger.dev task (`fetch-transcript`) is added. Auto-discovery via `trigger.config.ts` handles registration — no config changes needed.
- Each summarization produces two runs in the Trigger.dev dashboard instead of one. Operators should be aware when debugging failures.
- Billing increases by one task run per summarization. Acceptable given the observability and retry isolation benefits.
- Transcript fetch failures now retry independently (up to 3 attempts) without retrying episode/podcast fetch. This changes observable retry counts in the dashboard but is the desired behaviour.
- A future standalone transcript-refresh flow can call `fetchTranscriptTask.trigger(...)` directly without invoking the full summarization pipeline.
- Tests for transcript acquisition scenarios move from `summarize-episode.test.ts` to `fetch-transcript.test.ts`, improving test isolation.
