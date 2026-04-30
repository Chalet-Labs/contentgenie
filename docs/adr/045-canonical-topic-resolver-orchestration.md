# ADR-045: Canonical-topic resolver orchestration — episode-level budget at the fan-out layer

**Status:** Accepted
**Date:** 2026-04-29
**Issue:** [#386](https://github.com/Chalet-Labs/contentgenie/issues/386) (part of epic [#376](https://github.com/Chalet-Labs/contentgenie/issues/376))
**Relates to:** [ADR-027](027-summarize-episode-pure-consumer.md), [ADR-031](031-episode-topics-junction-table.md), [ADR-042](042-canonical-topics-foundation.md), [ADR-044](044-entity-resolution-transactional-pattern.md)

---

## Context

[ADR-042](042-canonical-topics-foundation.md) §"Three-tier resolution pipeline" caps disambiguator calls at five per episode. [ADR-044](044-entity-resolution-transactional-pattern.md) ratifies `resolveTopic(input)` as a per-topic, transactional, two-phase function — it knows nothing about siblings inside the same episode. The cap is therefore a property of a fan-out, not of any single resolver call. This ADR records where the cap lives, and the contract it imposes on callers.

Two structural questions:

1. **Where does the disambig-budget cap live?** Inside `resolveTopic` (every call would need to receive a "budget remaining" counter, mutating it on the way out)? Inside the orchestrator (orchestrator decides, possibly calling a different code path for over-budget topics)? Or as a flag passed into `resolveTopic` (`forceNew=true`)?
2. **What does the over-budget code path actually do?** The 6th, 7th, ... topics in a high-extract-count episode must still produce a canonical and a junction row — silently dropping them strands the episode's takeaways from any topic page.

The issue body recommends option (b) with a stand-alone `forceInsertNewCanonical` helper. This ADR ratifies that recommendation and pins down the lock semantics.

## Decision

### 1. Episode-level budget lives in the orchestrator, not in `resolveTopic`

`src/trigger/helpers/resolve-topics.ts` exports `resolveAndPersistEpisodeTopics(episodeId, topics, summary)` and is the sole site that knows about `MAX_DISAMBIG_CALLS_PER_EPISODE = 5`. It maintains a per-episode counter, calls `resolveTopic(input)` for the first N topics, and switches to `forceInsertNewCanonical` once the counter would exceed five disambig calls.

`resolveTopic` stays per-topic and stateless across topics. The function's contract is unchanged from ADR-044; this ADR only documents the assumption that callers fan out and track per-fan-out budgets. The constant lives next to the existing entity-resolution constants in `src/lib/entity-resolution-constants.ts` so all tunables are in one place.

**Why budget at the orchestrator and not as a `forceNew` flag passed into `resolveTopic`:**

- A flag-driven path inside `resolveTopic` mixes two contracts in one function. The auto-match → kNN → disambig branches are about _picking_ a canonical; `forceNew` is about _bypassing_ picking entirely. Co-locating them makes both harder to reason about and forces every test to set up the pick path even when only the bypass path is exercised.
- The orchestrator already knows the budget; threading it through `resolveTopic` changes a per-topic API into a per-episode API, leaking orchestration concerns into a layer that is otherwise pure.
- A separate `forceInsertNewCanonical` helper sits next to its only caller and can be removed if the budget ever goes away. A flag inside `resolveTopic` becomes permanent surface area.

The cost is one additional helper (~30 LOC) and one extra public symbol on `database.ts`. Accepted.

### 2. `forceInsertNewCanonical` still acquires the advisory lock and runs exact-lookup before insert

The orchestrator's "force-new" path is **not** a raw `INSERT`. ADR-044 §3 (canonical `normalizeLabel`) and §4 (exact-lookup pre-kNN) apply equally to this path:

- Acquire `pg_advisory_xact_lock(hashtextextended(JSON.stringify([normalizeLabel(label), kind]), 0))`.
- Run exact-lookup. If a row with `(lower(normalized_label), kind, status='active')` already exists, treat it as auto-match (similarity := 1.0) and skip the insert.
- Otherwise run the existing "new" insert path (`INSERT ... ON CONFLICT DO NOTHING RETURNING id`); on zero-row return, exact-lookup again (recovery; never another kNN, per ADR-044 §4).
- Write `episode_canonical_topics`: the pre-insert exact-hit branch and the zero-row recovery branch use `match_method='auto'` (similarity := 1.0); only the true new-insert branch uses `match_method='new'` (similarity := null). The coverage-score field is identical across all three paths.

Skipping the lock or the exact-lookup would re-introduce both failure modes ADR-044 explicitly closed:

- The whitespace-variant race (lock-key disagreement with the unique index) burns one disambig retry and produces a stranded canonical.
- The 91–180 day event-type kNN gap hides an active canonical from the kNN filter; without exact-lookup we would mint a duplicate that reconciliation must merge.

Path-wise the helper is a strict subset of TX-1's new-insert tail. Implementation can either inline the SQL or reuse `transactional()` and the same SQL helpers in `entity-resolution.ts`; this ADR pins the _behaviour_ (lock + exact-lookup + insert + junction), not the source-code factoring.

`match_method='new'` is correct for the **true new-insert branch** of the over-budget path — the canonical was minted without a kNN-driven decision, the same as a pure new-insert, even though the cause is administrative rather than evidential. The pre-insert exact-hit branch and the zero-row recovery branch both use `match_method='auto'` (similarity := 1.0) because an existing canonical was found without inserting a new one. Future analytics can correlate `match_method='new'` rows with the orchestrator's `versionTokenForcedDisambig=false, candidatesConsidered=0` shape if it ever needs to break down "new because no neighbours" vs "new because over budget".

### 3. Resolution runs after summary persistence; failure never blocks summary

Mirrors [ADR-027](027-summarize-episode-pure-consumer.md) and [ADR-031](031-episode-topics-junction-table.md). The new step in `summarize-episode.ts` is wrapped in `try { await resolveAndPersistEpisodeTopics(...) } catch (err) { logger.warn(...) }`. The summary + categories are committed before the resolver step starts; resolver failure cannot roll them back because they are already on separate transaction round-trips.

The orchestrator itself is engineered to never throw: per-topic failures are caught and aggregated into a `failed` count. The outer try/catch is a defence-in-depth backstop for unexpected orchestrator bugs, embedding helper failures (the 2 batched `generateEmbeddings` calls), or the `resolveTopic` call rejecting in a way that escapes the inner per-topic catch. ADR-031's stance — "summary persists even when topics fail" — applies symmetrically here.

### 4. Custom-prompt users skip canonical-topic resolution silently

When `aiConfig.summarizationPrompt !== null`, the resolver step is skipped wholesale. ADR-031 already documents the rationale: custom prompts are user-supplied, may target other JSON shapes, and may not emit the new `topics` array at all. Forcing extraction would either fail loudly on every custom-prompt run or silently inject a topics requirement that breaks unrelated parsers. This is the same stance as ADR-031's category-level skip; the canonical-topic layer follows it.

The detection point is the AI-config read that already happens earlier in `summarize-episode.ts` (`getActiveAiConfig().summarizationPrompt`). No new state needed.

### 5. Embeddings batched at exactly two calls per episode

`resolveAndPersistEpisodeTopics` issues two `generateEmbeddings(...)` calls regardless of topic count: one over `identityText(t) = t.label + " | " + t.aliases.join(", ")` for every topic, and one over `contextText(t) = t.label + " — " + t.summary` for every topic. The two arrays are zipped onto the `ResolveTopicInput` shape per topic. Per-topic embedding is a budget regression — ADR-042 §"Dual embeddings" mandates the dual-vector shape but the call structure is an orchestrator concern.

If either batch call rejects, the orchestrator returns `{ resolved: 0, failed: topics.length }` and the outer try/catch in `summarize-episode` logs the failure. The summary + categories were already committed, so no rollback applies.

### 6. Observability shape lands with this issue, not A9

The orchestrator emits a structured log line and increments `metadata.root` counters per ADR-042 §"Admin merge and observability ship with EPIC A". The shape:

```ts
{
  resolved: number,                   // count of topics that produced a junction row
  failed: number,                     // count of topics whose resolveTopic / forceInsertNewCanonical threw
  matchMethodDistribution: { auto: number, llm_disambig: number, new: number },
  versionTokenForcedDisambig: number, // count of topics that forced disambig via the version-token regex
  candidatesConsidered: { p50: number, max: number },  // sketch of resolver kNN survivor pool
  budgetExhausted: boolean,           // true iff any topic short-circuited via forceInsertNewCanonical
  topicCount: number,
  episodeId: number,
}
```

A9 (#387) consumes these counters; this issue ships them. The shape is documented here so #387 can land without re-litigating field names.

## Consequences

### Positive

- `resolveTopic` keeps its per-topic, stateless contract from ADR-044. Adding a `forceNew` flag would have widened the surface area and made the resolver harder to test.
- Cost amplification is bounded: at most 5 LLM disambig calls per episode + 2 embedding calls, regardless of how many topics the prompt extracts. Ten-topic episodes (the prompt's hard cap is 8 via `MAX_TOPICS`) cannot blow the budget by an order of magnitude.
- Graceful degradation is unchanged: summary + categories ship under their own try/catch (existing behaviour); canonical topics ship under a new try/catch (added by this issue).
- `forceInsertNewCanonical` reuses the lock + exact-lookup pattern, so the over-budget path inherits ADR-044's correctness guarantees rather than re-introducing the races it closed.

### Negative

- Two near-identical insert paths in the codebase (the resolver's `insertCanonical` + `finalizeMatch` tail, and the new `forceInsertNewCanonical`). Mitigated by extracting a shared helper if a third caller appears; for now, both are short and locally readable.
- Adding the budget cap at the orchestrator means future changes to the cap (e.g. lifting it for premium users) require coordinated edits in two places — the constant in `entity-resolution-constants.ts` and the orchestrator's branch logic. Constants-only changes work in place.
- The "always succeed" orchestrator contract makes test intent slightly less obvious: a failing topic is observable only via the returned `failed` count, not via a thrown error. Compensated by the structured log line and the per-topic try/catch, which preserves the failure reason.

### Trade-offs accepted

- The budget cap is per-episode, not per-account or per-window. A user who re-summarises 100 episodes in a row does pay 100×5 disambig calls. Accepted: re-summarisation is admin-only and infrequent; per-account caps add multi-process state that bursty Trigger.dev runs cannot share cheaply.
- `match_method='new'` does not distinguish "new because no neighbours" from "new because over budget" at the row level. Observability counters do, which is the layer that needs the distinction.

## References

- Issue: [#386](https://github.com/Chalet-Labs/contentgenie/issues/386)
- ADR-027 §3 — graceful-degradation precedent for summary persistence.
- ADR-031 §"Custom prompts intentionally bypass topic extraction" — the same stance applied symmetrically here.
- ADR-042 §"Three-tier resolution pipeline" — the 5-call cap originates here.
- ADR-044 §3 + §4 — the lock + exact-lookup invariants `forceInsertNewCanonical` must respect.
