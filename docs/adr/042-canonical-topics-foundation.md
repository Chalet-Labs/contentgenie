# ADR-042: Canonical Topics Foundation — Dual-Layer Topic Model with Embedding-Backed Resolution

**Status:** Accepted
**Date:** 2026-04-27
**Issue:** [#382](https://github.com/Chalet-Labs/contentgenie/issues/382) (part of epic [#376](https://github.com/Chalet-Labs/contentgenie/issues/376))
**Spec:** `.dev/pm/specs/2026-04-25-canonical-topics-foundation.md` (Approved; internal — not committed to the repo)
**Relates to:** [ADR-022](022-trending-topics-snapshot.md), [ADR-027](027-summarize-episode-pure-consumer.md), [ADR-031](031-episode-topics-junction-table.md), [ADR-033](033-cross-episode-topic-ranking.md), [ADR-034](034-personal-topic-overlap-indicators.md), [ADR-043](043-pgvector-on-neon-pplx-embed.md)

---

## Context

Today's topic system extracts **broad categorical tags** ("AI & Machine Learning", "Leadership & Career Development", "AI Business Strategy"). These describe the general subject area an episode covers but don't capture the specific named things an episode actually discusses. The mechanical reason is the summarization prompt: it constrains topics to _"2-5 words, professional, Title Case"_ (see the `categories` section in `src/lib/prompts.ts`), producing categories by design. Even relaxing the prompt would not be enough — exact-string matching would still fail on "Opus 4.7" vs "Claude Opus 4.7" vs "Anthropic's new Opus".

What users actually want is two things the current system cannot deliver:

1. **News-event clustering across podcasts.** When five different podcasts cover the Opus 4.7 release in the same week, the user should see _"You've already heard about Opus 4.7 from three other podcasts."_ Today, all five episodes share an "AI & Machine Learning" tag, which gives no signal about specific overlap.
2. **Evergreen-concept clustering across podcasts.** When Huberman and Modern Wisdom both cover _creatine_, or when multiple podcasts discuss _emotional regulation_, users want either dedup ("I've already heard 4 episodes on creatine this month") or synthesis ("give me the consensus takeaways across these 6 podcasts"). Both episodes share "Health & Longevity" — useless for either purpose.

The core technical problem is **entity resolution**: extracting topics at the right granularity _and_ canonicalizing them across episodes so different surface forms collapse to the same canonical entity.

The full alternatives table, technical design, threshold tuning hooks, work breakdown, and risk register live in the spec (`.dev/pm/specs/2026-04-25-canonical-topics-foundation.md`). This ADR records the architectural decisions; the embedding model and pgvector storage choice live in [ADR-043](043-pgvector-on-neon-pplx-embed.md) as a separable concern.

## Decision

**Hybrid embeddings + LLM disambiguation pipeline, with a two-layer topic model.** The system extracts two parallel topic layers in a single LLM summarization call:

- **Layer 1 — Categories** (preserved unchanged from today). Broad professional tags matched by exact string. Continues to power existing UI surfaces. No structural change.
- **Layer 2 — Canonical Topics** (new). Specific named events, entities, and concepts. Stored in a new `canonical_topics` table with vector embeddings, matched via a three-tier resolution pipeline.

A canonical topic covers both event-type things ("Claude Opus 4.7 release", "KelpDAO hack", "Clarity Act") and topic-type things ("creatine supplementation", "emotional regulation", "Pomodoro technique") via a `kind` enum that distinguishes them. The same canonicalization machinery handles both — only the decay rules differ.

### Topic kind taxonomy (9 values)

`release | incident | regulation | announcement | deal | event | concept | work | other`. Six event-type, two topic-type, plus a catch-all. The catch-all `other` requires `relevance >= 0.5` to canonicalize (otherwise extracted ephemerally without a junction row). This keeps the discriminator tight enough for reliable LLM classification while remaining extensible via `ALTER TYPE ... ADD VALUE`.

### Dual embeddings

Each canonical carries two `vector(1024)` columns produced by the same embedding pass:

- `identity_embedding` — over `label + " | " + aliases.join(", ")`. Used for kNN. Captures the _entity_, not the framing.
- `context_embedding` — over `label + " — " + summary`. Used only as evidence passed to the LLM disambiguator. Captures episode context.

Two HNSW indexes (one per column) are maintained.

### Three-tier resolution pipeline

Resolution runs **inside a transaction guarded by a Postgres advisory lock** keyed on `hashtext(normalized_label || '|' || kind)`, serializing concurrent inserts of the same brand-new entity:

1. **Acquire advisory lock** for `(normalized_label, kind)`. Concurrent runs block here, then re-execute the steps below — second arrival sees the canonical the first arrival just inserted.
2. **kNN candidate fetch.** Cosine over `identity_embedding`, top-1 (auto-match candidate) and top-20 (disambiguator candidate pool). Per-query `SET LOCAL hnsw.ef_search = 200`. Filtered: `status='active' AND (kind IN ('concept','work') OR last_seen > now() - interval '90 days' OR ongoing = true)`.
3. **Version-token pre-gate.** Regex over both labels: if numeric/version tokens differ (`4.6` vs `4.7`, `2024` vs `2025`, `WWDC 2025` vs `WWDC 2026`), force the disambiguator path regardless of similarity. Catches the "Opus 4.6 vs 4.7 at 0.95 cosine" failure mode that pure cosine cannot.
4. **Decision:**
   - top-1 cosine > **0.92** AND same `kind` AND version-gate passes → **auto-match**
   - any top-20 ≥ **0.82** → **LLM disambiguator** (uses `context_embedding`-derived summaries as evidence)
   - otherwise → **INSERT new canonical** (still inside the lock; safe under concurrency)
5. **Release advisory lock** (transaction commit).

A hard cap of 5 disambiguator calls per episode bounds LLM cost; excess topics short-circuit to `new`.

### Soft-merge with atomic path compression

Reconciliation may merge canonical A into canonical B. Junction rows pointing at A are rewritten to the **terminal** canonical id inside the same transaction. Because the junction has a `(episode_id, canonical_topic_id)` unique constraint, a plain `UPDATE` would conflict whenever an episode is already linked to both winner and loser. The compression is therefore a re-insert on the winner with conflicts ignored, followed by a delete of the loser-pointing rows:

```sql
INSERT INTO episode_canonical_topics (episode_id, canonical_topic_id, /* ... */)
SELECT episode_id, winner.id, /* ... */
FROM episode_canonical_topics
WHERE canonical_topic_id = loser.id
ON CONFLICT (episode_id, canonical_topic_id) DO NOTHING;

DELETE FROM episode_canonical_topics
WHERE canonical_topic_id = loser.id;
```

Read paths never chase `merged_into_id` pointers — there is no chain depth to bound, no cycle risk to detect, no double-counting in joins. Path compression at write time is one operation that eliminates an entire class of bugs.

### Schema-level integrity

Explicit CHECK constraints enforce invariants that application bugs cannot accidentally violate:

- `(status='merged') ⇔ (merged_into_id IS NOT NULL)` — biconditional: merged rows must point somewhere; active/dormant rows must not.
- `merged_into_id <> id` — self-cycle ban.
- `relevance ∈ [0,1]`, `coverage_score ∈ [0,1]` — range checks.
- `match_method IN ('auto','llm_disambig','new')` — enum gate on the audit column.
- `episode_count >= 0`, `label` and `summary` not blank.

The `merged_into_id` self-FK uses `onDelete: 'restrict'` (not `set null`). Soft-merge implies never-delete; a merged row with a NULL target violates the audit trail. GDPR-style hard delete, if ever needed, must route through an explicit reparent flow.

A partial unique index on `(lower(normalized_label), kind) WHERE status='active'` provides a DB-level backstop against duplicate-canonical creation if the advisory lock is ever bypassed.

### Decay and the `ongoing` flag

- **Event-type kinds** (`release`, `incident`, `regulation`, `announcement`, `deal`, `event`) → `status='dormant'` after 180 days unless `ongoing=true`.
- **Topic-type kinds** (`concept`, `work`) → never decay.
- `ongoing=true` exempts a canonical from decay regardless of kind. Inferred from kind context by the LLM during extraction. Covers WWDC 2026, Bitcoin halving, multi-month rollouts, ongoing regulations — without this flag, reconciliation perpetually re-creates these canonicals as separate dormant entries reactivate.

### Derived `episode_count`

Maintained either via junction triggers or nightly recompute against `episode_canonical_topics` — never mutated optimistically by the resolver. Optimistic counters drift under soft-merge plus episode-delete cascades; recompute is cheap and correct. Digest staleness gating (Feature 2) reads the derived count, not a stored count.

### Version-token regex pre-gate

```regex
\b(\d+\.\d+(?:\.\d+)?|\d{4}|v\d+(?:\.\d+)*)\b
```

Covers semver (`4.7`, `4.6.1`), 4-digit years, and `v`-prefixed versions. Tunable in `src/lib/entity-resolution-constants.ts` (planned, lands in EPIC A) without schema change.

### Concept extraction is constrained against Layer-1 categories

The summarization prompt receives a sample banlist of existing `episode_topics.topic` strings (top ~50 by frequency) and rejects topic labels that match a category. Concept count capped at 3 per episode. Without this constraint, "Creatine", "Supplements", and "Health & Longevity" all show up as concepts across runs and the `concept` kind becomes a junk drawer.

### Resolution runs after summary persists

Mirrors the graceful-degradation pattern from [ADR-031](031-episode-topics-junction-table.md) and [ADR-027](027-summarize-episode-pure-consumer.md): summary and categories ship even if the resolver fails. Canonical-topic parse failure must not block category persistence — categories ship under their own try/catch.

### Admin merge and observability ship with EPIC A

`match_method` histograms, similarity logging, and a minimal admin merge/unmerge UI all land inside EPIC A. The "ship without UI" thesis depends on day-1 visibility and the ability to fix bad canonicals before they accumulate. Without observability, the validate-quality-before-UX thesis is unverifiable; without admin merge, week-1 bad canonicals are baked in by the time Feature 1 ships.

## Rationale

- **Two layers permanently.** Categories continue to power existing UI; canonical topics are the new specific layer. Both ship from one LLM call (~750 extra output tokens) — cheaper than two calls. Preserves existing UI; defers the decision on whether to ever sunset categories.
- **Hybrid 3-tier with version-token pre-gate.** Pure LLM canonicalization doesn't scale past ~5K canonicals (context window / cost). Pure embeddings fail on version nuance — "Opus 4.6" and "Opus 4.7" sit at ~0.95 cosine despite being structurally different entities. The hybrid splits the cases: high-confidence cases auto-match, ambiguous cases route to a judge, low-confidence cases create new and let reconciliation clean up later.
- **Concurrent-insert serialization via advisory lock.** Without it, two parallel summarization runs reliably create duplicate canonicals during launch-day news bursts. The partial unique index is a DB-level backstop, but advisory locks serialize at the application layer where the resolver can re-kNN inside the lock and find the freshly inserted canonical.
- **Dual embeddings, not single.** A single embedding over `label + summary` couples identity with episode context — same-entity drift across episodes (different framings → different embeddings of the same entity) and same-context collapse across entities (similar episode framings → close embeddings of unrelated entities). Separating them is cheap (~8KB per canonical) and structurally correct.
- **Top-1 for auto-match, top-20 for disambiguator.** Auto-match must remain conservative — only the closest neighbor is a candidate. Top-5 is too narrow for the `concept` kind, where the right canonical may be rank 6–20.
- **Soft-merge with atomic path compression on merge.** Read-time pointer chasing is a footgun: chain depth grows, cycles are possible under racing merges, and joins double-count when both source and target are referenced. Path compression mutates ~100 junction rows per typical merge (~10 merges/day at steady state) — a bounded write cost that eliminates the entire class of read-time bugs.
- **`merged_into_id` uses `ON DELETE RESTRICT` (not `SET NULL`).** A merged row with a NULL target violates the audit trail. Hard delete must route through an explicit reparent flow.
- **Derived `episode_count`.** Optimistic counters drift under soft-merge + episode-delete cascades. Recompute is cheap and correct.
- **`ongoing` flag.** Without it, reconciliation perpetually merges WWDC-2026 canonicals across the year as separate dormant entries reactivate. The `ongoing` exemption is structural, not a workaround.
- **Concept banlist sampling.** The `concept` kind is the most LLM-fuzzy bucket. Constraining it against existing categories prevents it becoming a junk drawer. Top-50 banlist refreshed on a 1-hour TTL with a manual invalidation hook from the admin UI.
- **Pairwise winner-vs-loser verification, not group-judge.** Group-judge ("are these all the same?") is a known over-merge mode. Pairwise verification of winner against each loser (N-1 calls instead of N(N-1)/2) is structurally safer at sub-quadratic cost. Reject the cluster if any loser fails verification.
- **Auto-match 0.92, disambiguate 0.82.** Lower thresholds (e.g. 0.75) on 1024-dim cosine merge semantically adjacent but unrelated concepts and inflate LLM cost; the 0.92/0.82 pair holds the bar high enough to avoid that. Tunable post-launch via `match_method` histogram.

## Consequences

### Trade-offs accepted

- **Two layers permanently.** Categories and canonical topics coexist forever. Slightly more storage and query complexity than a single-layer system, in exchange for preserving existing UI and avoiding a forced migration. Could collapse later if categories prove unused.
- **Dual embeddings double per-canonical embedding storage.** ~8KB extra per row (2× `vector(1024)` at 4 bytes/float). At 100K canonicals, ~800MB additional storage plus two HNSW indexes.
- **Advisory lock contention adds latency under burst ingestion.** Two parallel summarizations of the same brand-new entity serialize on the lock — the second waits for the first to commit. Worst case ~500ms added latency for the loser. Accepted; the alternative (duplicate canonicals) is structural data corruption.
- **Path-compression mutates junction rows on merge.** A reconciliation merge of A→B re-inserts `episode_canonical_topics` rows pointing at B with `ON CONFLICT (episode_id, canonical_topic_id) DO NOTHING`, then deletes the rows that were pointing at A. Bounded (~100 rows per typical canonical, ~10 merges/day at steady state).
- **Custom-prompt users bypass canonical-topic extraction silently.** Same stance as [ADR-031](031-episode-topics-junction-table.md). Custom prompts are user-supplied and may target specific JSON formats; forcing the new schema would break their parsers. They keep category-only behavior.
- **Event-type dormancy may cause stale matches on year-old episodes.** A user listening to a year-old episode about "Opus 4.6 release" sees correct dedup if the canonical still has junction rows, but a _new_ extraction of the same event might create a duplicate canonical (because the original is dormant and excluded from kNN). Reconciliation eventually merges them. Mitigated for recurring events by `ongoing=true`.
- **Backfilled episodes have thinner topic data than newly summarized ones.** Stored summaries are condensed (~600 chars); some topics mentioned only in transcripts won't appear in summaries. Mitigated by an admin "full re-summarize" button per episode.
- **`concept` classification has subjective drift.** Different LLM runs may classify the same thing as `concept` vs `other`. Reconciliation re-judges; admin can override.
- **Digest staleness.** Multi-episode digests regenerate only when derived `episode_count` grows by N (starter N=3). Same staleness pattern as [ADR-022](022-trending-topics-snapshot.md).

### Failure modes mitigated

- **Concurrent insert race creates duplicate canonicals** — advisory lock + partial unique index.
- **Soft-merge chain or cycle bugs** — atomic path compression at merge time + the `(status='merged') ⇔ (merged_into_id IS NOT NULL)` biconditional CHECK + `merged_into_id <> id` self-cycle ban. The "always points at an active row" property is upheld by the reconciliation transaction (which compresses any pointer that would land on a merged row), not by a CHECK constraint — Postgres CHECKs validate only the current row, so the referenced row's status cannot be enforced declaratively.
- **Junction unique-constraint conflict on merge** — `ON CONFLICT (episode_id, canonical_topic_id) DO NOTHING`.
- **Counter drift on `episode_count`** — derived, recomputed in reconciliation; gating reads recomputed count, not stored count.
- **Recurring events silently dormant** — `ongoing` flag exempts from decay.
- **`other` kind becomes junk drawer** — `relevance >= 0.5` floor; below threshold extracted ephemerally without a junction row; reconciliation re-classifies high-frequency `other` entries.
- **Prompt injection via transcript-derived labels** — label validator rejects control chars and instruction-shaped strings; XML wrapping of raw transcript already in place.

### Downstream features unlocked

- **Feature 1 — Dedup awareness.** Canonical-topic-level overlap indicators on episode cards, summary display, and episode detail page. Reuses the pattern from [ADR-034](034-personal-topic-overlap-indicators.md) but operates on canonical topics instead of category strings, with category-based fallback when no canonical topics exist.
- **Feature 2 — Multi-episode synthesis.** A topic detail page at `/topic/[id]` showing a merged "key takeaways across N podcasts" digest, episode list sorted by coverage score, and consensus-vs-disagreement separation.

[ADR-033](033-cross-episode-topic-ranking.md)'s pairwise ranking continues to operate on the categories layer for v1; `coverage_score` from the extractor is enough for canonical topics initially.

## Reference

- Spec: `.dev/pm/specs/2026-04-25-canonical-topics-foundation.md` (internal) — full alternatives table, ingestion + reconciliation pipelines, threshold tuning hooks, work breakdown, risk register.
- Embedding model + pgvector storage: [ADR-043](043-pgvector-on-neon-pplx-embed.md).
