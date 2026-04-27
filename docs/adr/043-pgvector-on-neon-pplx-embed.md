# ADR-043: pgvector on Neon and pplx-embed-v1-0.6b for Canonical-Topic Embeddings

**Status:** Accepted
**Date:** 2026-04-27
**Issue:** [#382](https://github.com/Chalet-Labs/contentgenie/issues/382) (part of epic [#376](https://github.com/Chalet-Labs/contentgenie/issues/376))
**Spec:** `.dev/pm/specs/2026-04-25-canonical-topics-foundation.md` (Approved; internal — not committed to the repo)
**Relates to:** [ADR-042](042-canonical-topics-foundation.md)

---

## Context

[ADR-042](042-canonical-topics-foundation.md) records the architectural decisions for the canonical-topics foundation: dual-layer topic model, three-tier resolution pipeline with version-token pre-gate, dual embeddings on each canonical, advisory-lock concurrency control, soft-merge with atomic path compression, decay rules and the `ongoing` flag.

The **storage substrate** (where vectors live) and the **embedding model** (which model generates them) are separable from those architectural decisions. They can be re-evaluated and even swapped without re-litigating the resolution pipeline. Recording them in their own ADR keeps a future model migration cheap: only this ADR is invalidated, and only the migration steps documented below need to run.

This ADR records both decisions and the recall-budget rationale (`ef_search`) that mitigates spec risk **R1**.

## Decision

### Storage: pgvector on the existing Neon database

- No new infrastructure. `canonical_topics` lives in the same Neon Postgres that already hosts the rest of the schema; `DATABASE_URL` is reused via the existing Doppler-managed configuration.
- HNSW indexes with `vector_cosine_ops` and pgvector defaults: `m = 16`, `ef_construction = 64`. One HNSW index per embedding column → two HNSW indexes total on `canonical_topics` (one over `identity_embedding`, one over `context_embedding`).
- Recall-time tuning is per-query, not per-index: `SET LOCAL hnsw.ef_search = 200` inside the resolver transaction. Centralized as `HNSW_EF_SEARCH = 200` in `src/lib/entity-resolution-constants.ts` (planned, lands in EPIC A) so it can be tuned without schema change.

### Embedding model: `pplx-embed-v1-0.6b` via OpenRouter

- 1024-dimensional output. Both `identity_embedding` and `context_embedding` are `vector(1024)`.
- $0.004 per 1M input tokens at the time of writing.
- MIT-licensed weights as a fallback path if OpenRouter ever drops the model or rate-limits it past the resolver's needs.
- Top-decile retrieval quality at 1024 dimensions, comparable to the current Google and Alibaba 1024-dim entries on standard retrieval benchmarks (MTEB / BEIR).

### Versioning: `embedding_model_version` column on `canonical_topics`

- Default `'perplexity/pplx-embed-v1-0.6b'` — the OpenRouter model id, matching `EMBEDDING_MODEL` in `src/lib/ai/embed.ts`. Stamped on insert, never read by the resolver itself.
- Records which canonicals were embedded under which model so a future swap can issue a filtered re-embed (`WHERE embedding_model_version = 'perplexity/pplx-embed-v1-0.6b'`) instead of a full reindex.
- Prevents threshold tuning from being silently invalidated: `AUTO_MATCH_SIMILARITY_THRESHOLD = 0.92` and `DISAMBIGUATE_SIMILARITY_THRESHOLD = 0.82` are calibrated for 1024-dim cosine on this specific model. A model swap requires re-tuning, and the column makes the swap auditable.

## Alternatives Considered

| Alternative                                            | Why not                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dedicated vector DB (Pinecone / Qdrant / Weaviate)** | Specialized and battle-tested at scale, but at <1M vectors pgvector on the existing Neon database is operationally equivalent for zero new infrastructure cost. Adds an operational service to monitor, secure, sync, and pay for. Reconsider when active-canonical count approaches 1M or when index memory growth on Neon becomes the binding constraint. |
| **`text-embedding-3-small`**                           | Stable and cheap, but quality trails newer models on retrieval benchmarks at the 1024-dim point. Retained as the **fallback** model on the `embedding_model_version` migration path.                                                                                                                                                                        |
| **`gemini-embedding-2`**                               | Strong multilingual and multimodal future path. Tighter rate limits in practice and no MIT-licensed weights as a fallback. Multimodal (audio segment / transcript chunk) is out of scope at v1 — see spec "Out of scope".                                                                                                                                   |
| **`bge-m3`**                                           | Open weights, strong on retrieval. Operational overhead of self-hosting outweighs OpenRouter convenience at v1 scale. Becomes attractive if OpenRouter pricing or availability changes.                                                                                                                                                                     |

`pplx-embed-v1-0.6b` wins on the four-way intersection of quality, cost, dimension, and license-fallback at this corpus size.

The spec is the source of truth for the broader pipeline-shape alternatives (pure LLM canonicalization, embeddings-only without LLM judge, events-only, three-layer schema). The chosen architecture itself is recorded in [ADR-042](042-canonical-topics-foundation.md). The table above is the storage- and model-specific subset.

## Recall budget rationale (`ef_search = 200`)

The HNSW index returns the top-K nearest neighbors **before** the WHERE clause is applied. Inside the resolver, the kNN query is filtered by:

```
status = 'active'
AND (kind IN ('concept','work')
     OR last_seen > now() - interval '90 days'
     OR ongoing = true)
```

When the candidate set is heavily filtered (e.g., a popular event-type entity with most of its near-neighbors dormant), the post-filter survivor count can drop below the requested `LIMIT` even if pgvector returned `LIMIT` raw rows. The resolver needs at least 20 survivors for the disambiguator pool (top-20) and at least 1 for auto-match (top-1).

Setting `hnsw.ef_search = 200` widens the search front so post-filter survivors reliably saturate the disambiguator pool. The trade-off is query latency, which grows roughly linearly with `ef_search`. 200 is the starter value; tunable per-query in `src/lib/entity-resolution-constants.ts` (planned, lands in EPIC A) without schema or index change.

This setting mitigates spec risk **R1** ("HNSW filter-after-index returns <K results"). Per-query `SET LOCAL` keeps the budget scoped to the resolver's transaction; non-resolver queries (admin browsing, analytics) inherit the index default.

## Migration path for a future model swap

The `embedding_model_version` column makes a model swap a contained operation rather than a re-architecture:

1. **Add the new model.** Update `EMBEDDING_MODEL` in `src/lib/ai/embed.ts` to the new model id. Default `embedding_model_version` for new inserts changes to the new tag.
2. **Filtered re-embed via Trigger.dev backfill.** Batch-iterate `WHERE embedding_model_version = 'perplexity/pplx-embed-v1-0.6b'` via `generateEmbeddings(texts[])` (the helper exposed in `src/lib/ai/embed.ts` already supports batch input). For each batch, regenerate `identity_embedding` and `context_embedding` from the source `label`, `aliases`, and `summary`; UPDATE rows in a single transaction and stamp the new `embedding_model_version`. Bounded throughput; can run for days without affecting the resolver.
3. **Tolerate mixed-version state.** During migration the resolver's kNN sees both old and new vectors. Cosine similarity comparing across embedding-model spaces is meaningless, but the disambiguator's LLM stage is robust to noisy candidates. Thresholds may shift after the swap (re-tune via `entity-resolution-constants.ts`).
4. **Verify and finalize.** When `WHERE embedding_model_version = 'perplexity/pplx-embed-v1-0.6b'` returns zero rows, the migration is complete. The HNSW indexes are updated automatically by pgvector as vector rows are inserted or updated — pgvector links new vectors into the existing graph incrementally rather than performing a batch rebuild.

## Consequences

### Positive

- **Zero new infrastructure.** Reuses Neon, Doppler, and the existing connection pool.
- **Schema lives next to application data.** Joins (`episode_canonical_topics ↔ canonical_topics ↔ episodes`) are local; no cross-service consistency to manage.
- **Migration path is bounded and incremental.** A model swap is a backfill task, not a re-architecture.
- **Per-query recall tuning.** `ef_search` lives in code, not on the index, so changes ship without DDL.

### Negative

- **Two HNSW indexes per canonical row** (one each for `identity_embedding` and `context_embedding`). Query workload is bounded by dormancy decay — only `status='active'` rows are matched against — but storage and index growth track every row retained in `canonical_topics`, because the HNSW indexes cover every row regardless of status. At 100K canonicals, expect ~800MB raw vector storage (2× `vector(1024)` × 4 bytes/float × 100K) plus comparable HNSW index overhead — see spec **R10** for the full breakdown. Revisit at 500K active canonicals.
- **OpenRouter is the embedding-generation dependency.** Pricing or availability changes propagate to ingestion latency and cost. Mitigated by MIT-licensed fallback weights and the documented filtered-re-embed migration path (spec **R6**).
- **Threshold values are model-specific.** `AUTO_MATCH_SIMILARITY_THRESHOLD = 0.92` and `DISAMBIGUATE_SIMILARITY_THRESHOLD = 0.82` are calibrated for this model on 1024-dim cosine. A model swap requires re-tuning, which is the load-bearing reason `embedding_model_version` exists.
- **HNSW filter-after-index recall risk.** Mitigated by `ef_search = 200` and the OR-clause that includes `concept`/`work` and `ongoing` candidates regardless of `last_seen`.

### Drizzle compatibility

`drizzle-orm ^0.45.1` (per `package.json`) is well past the 0.30 introduction of `vector()`. No version bump needed (spec **R8**). The pgvector extension was enabled via a hand-written migration (`drizzle/0023_enable_pgvector.sql`) ahead of any `vector()` column declarations, satisfying spec **R9**.

## Reference

- Spec: `.dev/pm/specs/2026-04-25-canonical-topics-foundation.md` (internal) — risks **R1**, **R6**, **R8**, **R9**, **R10**; threshold-tuning hooks in `src/lib/entity-resolution-constants.ts`; HNSW index DDL specifics.
- Architecture wrapper: [ADR-042](042-canonical-topics-foundation.md).
