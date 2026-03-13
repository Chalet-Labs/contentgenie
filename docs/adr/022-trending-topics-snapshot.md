# ADR-022: Trending Topics via Daily LLM Snapshot

**Status:** Accepted
**Date:** 2026-03-13
**Issue:** [#192](https://github.com/Chalet-Labs/contentgenie/issues/192)

## Context

The dashboard needs a "Trending Topics" section showing AI-extracted topic clusters
from recent episode summaries. This requires periodic analysis of summarized content.

Related ADRs: ADR-003 (scheduled task pattern), ADR-008 (AI provider abstraction).

## Options Considered

### Option A: Real-time computation on page load

Query episodes + call LLM on every dashboard load.

- **Pro:** Always fresh data.
- **Con:** 2-5 second latency per page load. LLM cost scales with pageviews. Identical
  results for all users visiting within the same day. No caching benefit.

### Option B: Daily pre-computed snapshot (chosen)

A Trigger.dev scheduled task runs daily, queries recent summaries, calls the LLM once,
and stores the result in a `trending_topics` table.

- **Pro:** Single LLM call per day. Dashboard reads are a simple DB query (~10ms).
  Consistent data across all users. Append-only retention enables historical analysis.
- **Con:** Data is up to 24 hours stale. Requires a new table and background task.

### Option C: Algorithmic clustering (TF-IDF / LDA)

Use statistical NLP techniques to cluster topics without an LLM.

- **Pro:** No LLM cost. Deterministic output.
- **Con:** Requires additional ML dependencies. Produces less human-readable topic names.
  Doesn't handle semantic grouping well (e.g., "AI ethics" vs "responsible AI").

## Decision

**Option B** — Daily pre-computed LLM snapshot.

### Key decisions

1. **Append-only retention.** Old snapshots are never deleted. At ~1 row/day with a JSON
   column, storage cost is negligible. Enables future "trending over time" features.

2. **Token budget.** Only `title` + `keyTakeaways` are sent to the LLM (not full
   summaries or transcripts). This keeps input under 10K tokens for typical workloads
   (~50 episodes/week).

3. **7-day rolling window.** Captures a full week of content diversity without
   overwhelming the LLM context.

4. **Global scope.** Topics are derived from all summarized episodes, not per-user
   subscriptions. This ensures the feature works even for new users with few subscriptions.

5. **Empty window handling.** If no episodes were summarized in the period, store
   `topics: []` rather than skipping the insert. This prevents stale data from appearing
   current.

## Consequences

- A new `trending_topics` table is added (requires migration).
- One additional LLM call per day (~5-10K input tokens, ~500 output tokens).
- Dashboard gains a ~10ms DB read instead of a multi-second LLM call.
- If the Trigger.dev task fails, the dashboard continues to show the most recent
  snapshot, which may be older than one day (graceful degradation).
- The `trending_topics` table will grow by ~365 rows/year. No cleanup is needed for
  the foreseeable future; a retention policy can be added later if warranted.
