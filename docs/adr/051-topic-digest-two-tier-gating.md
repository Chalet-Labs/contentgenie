# ADR-051: Topic Digest Two-Tier Gating (Staleness vs Rate Guard)

**Status:** Accepted
**Date:** 2026-05-04
**Issue:** [#398](https://github.com/Chalet-Labs/contentgenie/issues/398) (parent: [#379](https://github.com/Chalet-Labs/contentgenie/issues/379))

## Context

Per-topic synthesis digests (`canonical_topic_digests`, schema landed in
[#397](https://github.com/Chalet-Labs/contentgenie/issues/397)) are produced by
a Trigger.dev task that calls an LLM once per canonical topic. Two distinct
abuse / waste vectors exist:

1. **Cache freshness.** The product spec (ADR-042 §"Digest staleness") commits
   to regenerating only when the derived `episode_count` has grown by 3 since
   the previous digest. This is the _content-correctness_ gate — a digest of
   3 episodes is still valid when a 4th episode lands; it becomes stale at 6.
2. **Click-storm protection.** The digest is invoked from a user-facing chip
   ("Synthesize") on `/topic/[id]`. Without protection, a user repeatedly
   clicking — or N concurrent users clicking the same topic — would each enqueue
   a fresh LLM call even if the staleness gate allowed it (e.g. immediately
   after coverage just crossed the +3 threshold).

A naive "single gate" design conflates these. If we use only the staleness
gate at task-entry time, repeat clicks after a regeneration window opens still
fire concurrent LLM calls. If we use only a wall-clock guard, a popular topic
that gains 3 new episodes within an hour stays stale.

Related ADRs: [ADR-022](022-trending-topics-snapshot.md) (snapshot pattern,
empty-on-failure), [ADR-042](042-canonical-topics-foundation.md) §"Digest
staleness" (the +3 threshold itself), [ADR-027](027-summarize-episode-pure-consumer.md)
(consumer-side dedupe via summaryStatus CAS).

## Options Considered

### Option A: Single gate inside the task (staleness only)

Server action always enqueues; task checks staleness before LLM call.

- **Pro:** Simplest. One source of truth.
- **Con:** Concurrent clicks on a freshly-eligible topic all pass the gate
  in parallel and every run pays for an LLM call. Trigger.dev concurrency=3
  caps damage but does not eliminate it.

### Option B: Single gate at server action (1-hour wall clock)

Server action returns `'cached'` if `generated_at` is within 1h.

- **Pro:** Single round trip, click-storm safe.
- **Con:** Violates ADR-042: a topic that gains 3 episodes during the hour
  stays stale. Also pushes content-correctness logic into the action layer
  where it can drift from the task implementation.

### Option C: Two-tier gating (chosen)

Distinct gates with distinct purposes, evaluated at distinct layers:

| Gate       | Layer         | Purpose                   | Predicate                                          |
| ---------- | ------------- | ------------------------- | -------------------------------------------------- |
| Staleness  | Server action | Content correctness       | `derived_count - episode_count_at_generation >= 3` |
| Rate guard | Trigger task  | Click-storm / concurrency | `generated_at < now - 1h`                          |

- **Pro:** Each gate has one job. Click storms collapse to a single LLM call;
  staleness logic is co-located with the cached-vs-queued decision the action
  must communicate to the UI; the task remains safe to invoke even if a future
  caller bypasses the action layer (e.g. admin debug, internal retry).
- **Con:** Two predicates to keep in sync via tests. Slightly more code.

## Decision

**Option C** — two-tier gating.

### Server action gate (staleness, ADR-042-compliant)

`triggerTopicDigestGeneration(canonicalTopicId)`:

1. Compute derived `episode_count` via `canonicalTopicEpisodeCount()`.
2. Look up existing digest row for `canonical_topic_id`.
3. Return `'ineligible'` if derived count `< 3`.
4. Return `'cached'` if a digest exists AND
   `derived_count - episode_count_at_generation < 3` (regardless of how recent
   `generated_at` is — fresh content can't make a still-current digest stale).
5. Otherwise enqueue and return `'queued'`.

### Task gate (rate guard, click-storm safety)

Inside `generateTopicDigest`, before the LLM call:

1. Re-fetch existing digest row.
2. If `generated_at >= now - 1h`, log + return early with no LLM call. Do
   NOT update any row.

The 1h window is intentionally shorter than the typical "3 new episodes
arrive" cadence (median canonical gains episodes over days, not minutes per
ADR-042 trending). It exists for the bursty click case, not as a content
freshness signal.

### Why not enforce the staleness gate in the task too?

The task is the _correctness_ layer of last resort, but staleness is a
product decision that shifts with `MIN_GROWTH_FOR_REGEN` (currently 3).
Encoding it in two places creates two sources of truth. The task encodes
_resource_ concerns (concurrency, rate, model selection); the action encodes
_UX_ concerns (cached vs queued). If a future feature needs a "force
regenerate" path (admin-only), it bypasses the action gate but still inherits
the rate guard. That asymmetry is the right one.

## Consequences

- Two gates, two test paths. Acceptance criteria explicitly test both.
- `MIN_DERIVED_COUNT_FOR_DIGEST = 3` and `STALENESS_GROWTH_THRESHOLD = 3` are
  module-level constants, exported for test pinning. Changing either requires
  an ADR amendment.
- `RATE_GUARD_WINDOW_MS = 60 * 60 * 1000` (1h) is a task-internal constant.
- The action's three return states (`'queued' | 'cached' | 'ineligible'`)
  map directly to the UX states D3/D4 will render. No additional plumbing.
- A click during the rate-guard window after the staleness gate has
  flipped to `'queued'` produces a `'queued'` action result but a no-op
  task — the user sees a spinner that resolves to the existing digest. That
  is acceptable: the existing digest is by definition <1h old and therefore
  current.
