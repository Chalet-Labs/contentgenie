# ADR-052: Topic Digest Failure Handling — Throw, Don't Persist Empty

**Status:** Accepted
**Date:** 2026-05-04
**Issue:** [#398](https://github.com/Chalet-Labs/contentgenie/issues/398) (parent: [#379](https://github.com/Chalet-Labs/contentgenie/issues/379))

## Context

When the LLM call inside `generate-topic-digest` fails (provider outage,
malformed JSON, schema validation failure), there are two precedent patterns
in the codebase:

- **ADR-022 (trending topics):** persist `{ topics: [] }` on terminal-attempt
  failure so the dashboard shows "no topics" instead of stale data. The
  trending-topics table is **append-only** — every snapshot is a new row, so
  an empty row is additive and harmless.

- **summarize-episode (consumer):** flip `summaryStatus = 'failed'` and write
  `processingError`. No data overwrite.

`canonical_topic_digests` differs structurally from both:

- It has a **unique index on `canonical_topic_id`**, so writes are UPSERTs.
- A previously-good digest may already exist for this topic.
- An empty result UPSERT would _destroy_ good content with empty arrays.
- Topic detail (D3) reads the latest row — it cannot fall back to "the
  previous good one" because there is no previous row.

## Options Considered

### Option A: Mirror ADR-022 (UPSERT empty on failure)

Persist `{ consensus_points: [], disagreement_points: [], digest_markdown: "" }`
on terminal failure.

- **Pro:** Consistent with trending-topics pattern. Surfaces the outage to
  users via empty UI state.
- **Con:** **Destroys a previously-good digest.** A topic that had a great
  3-episode digest and is now being regenerated for 6 episodes would, on
  LLM outage, regress to empty. This is strictly worse than serving the
  stale-but-valid 3-episode version. Append-only assumption from ADR-022
  does not hold here.

### Option B: Conditional UPSERT (empty only when no prior row)

Insert empty if no row exists; do nothing on failure if a row exists.

- **Pro:** Preserves prior good content.
- **Con:** Two code paths. The empty-row case still creates a poison row
  that the staleness gate then sees as fresh-enough to skip regen until +3
  more episodes arrive — so the empty digest "sticks" for days. Worse than
  the canonical fix.

### Option C: Throw, persist nothing (chosen)

Re-raise the LLM/parse error. Trigger.dev marks the run failed, retries per
task config, alerts via dashboard. The digest row (if any) is unchanged.

- **Pro:** Existing prior digest (if any) is preserved. Trigger.dev's retry
  - alerting is the right place for transient outages. Empty UI state is
    driven by absence of row, not presence of empty row — semantically clean.
- **Con:** A first-time digest for a topic stays absent during the outage.
  Acceptable: D3 already needs an empty state for "no digest yet" because
  a topic at episode count 3 won't have one until first generation.

### Option D: Throw `INSUFFICIENT_VALID_SUMMARIES` for data-quality failures

Separate error code for the case where derived `episode_count >= 3` but
fewer than 3 of those episodes have a non-null `summary` text. Don't even
attempt LLM call.

- **Pro:** Visible in metrics as a distinct failure mode, separate from
  provider outages. Doesn't bill an LLM call for a guaranteed-thin output.
- **Con:** Slightly more code; one more error code to wire.

## Decision

**Option C + Option D combined.**

1. **LLM / parse / validation failures:** throw. Trigger.dev retries (default
   3 attempts via `trigger.config.ts`); after exhaustion the run is marked
   failed in the dashboard. No row write. The previous digest (if any) is
   preserved.

2. **Insufficient valid summaries** (derived count `>= 3` but fewer than 3
   episodes in the read window have non-null, non-blank `summary` text):
   throw `AbortTaskRunError` with code `INSUFFICIENT_VALID_SUMMARIES`. Do
   NOT retry — this is a data quality issue, not a transient one.

3. **`canonical.status !== 'active'`** or derived `episode_count < 3`:
   throw `AbortTaskRunError`. The server action is supposed to gate this,
   but the task validates defensively for direct-invoke / admin-debug
   paths.

4. **Rate guard hit** (digest <1h old): return early with a structured
   result (no throw, no row write). This is success-like, not failure-like.

### Metrics emission

On every terminal outcome, emit one of:

- `metadata.root.increment("digests.generated", 1)` — happy path
- `metadata.root.increment("digests.rate_guarded", 1)` — 1h short-circuit
- `metadata.root.increment("digests.insufficient_summaries", 1)` — data quality
- `metadata.root.increment("digests.llm_failed", 1)` — LLM/parse error (in catch
  block before re-throw)
- `metadata.root.increment("digests.aborted", 1)` — pre-LLM validation aborts

This mirrors the lesson from issue #386 (orchestrator early-exit must call
counters before returning, not rethrow silently — see MEMORY.md).

## Consequences

- A first-attempt digest during an LLM outage is delayed, not poisoned.
- The Trigger.dev dashboard becomes the canonical observability surface for
  digest failures (matches ADR-022 graceful-degradation philosophy, just at
  a different layer).
- D3 (topic detail page) needs an empty state for "no digest yet" — already
  required for the never-generated case, so this adds no new UI work.
- The `digests.llm_failed` counter must increment in the catch block
  _before_ re-throwing, otherwise the counter is silently dropped (issue
  #386 lesson).
