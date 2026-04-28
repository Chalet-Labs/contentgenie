# ADR-044: Entity-resolution transactional pattern (advisory lock + neon-serverless Pool driver + two-phase LLM split + canonical normalizeLabel)

**Status:** Accepted
**Date:** 2026-04-28
**Issue:** [#384](https://github.com/Chalet-Labs/contentgenie/issues/384) (part of epic [#376](https://github.com/Chalet-Labs/contentgenie/issues/376))
**Spec:** `.dev/pm/specs/2026-04-25-canonical-topics-foundation.md` (Approved; internal — not committed to the repo)
**Relates to:** [ADR-042](042-canonical-topics-foundation.md), [ADR-043](043-pgvector-on-neon-pplx-embed.md), [ADR-031](031-episode-topics-junction-table.md), [ADR-027](027-summarize-episode-pure-consumer.md)

---

## Context

[ADR-042](042-canonical-topics-foundation.md) ratifies the three-tier resolution pipeline (auto-match → LLM disambiguator → new-insert) with a `pg_advisory_xact_lock`-guarded transaction, dual embeddings, and the `match_method` enum. [ADR-043](043-pgvector-on-neon-pplx-embed.md) covers the storage substrate and `ef_search = 200` recall budget. The current ADR fills in the runtime patterns the resolver needs to enforce those decisions correctly under real workload conditions.

Three structural problems surfaced when implementing the pipeline against the existing codebase:

1. **`drizzle-orm/neon-http` does not support `db.transaction(...)`.** The advisory-lock requirement is non-negotiable. The HTTP driver issues each statement as a fresh request; there is no shared session for `pg_advisory_xact_lock` to span.
2. **The disambiguator step is an OpenRouter LLM round-trip with multi-second p99.** Holding it inside an open transaction that also holds the per-`(label, kind)` advisory lock and a Pool connection is connection starvation under burst, not the "~500ms latency for the loser" estimated in [ADR-042](042-canonical-topics-foundation.md). That estimate is for the fast-path Postgres-only operations.
3. **kNN cannot see active-but-old event-type canonicals.** ADR-042 §"Trade-offs accepted" line 156 documents a 91–180 day window where event-type canonicals are `status='active'` but excluded from the kNN filter (`last_seen > now() - 90 days`). Any single-kNN retry path is broken inside that window.

Two correctness defects also showed up under careful review of the issue-body spec:

4. **Whitespace-variant race on `(normalized_label, kind)`.** The unique index is on `lower(trim(label))` (via the `normalized_label` write). The advisory-lock key the spec proposed used `lower(label)` — `"Foo"` and `" Foo "` produce DIFFERENT lock keys (no serialisation) but COLLIDE on the unique index.
5. **Disambiguator parse / transport / schema-validation failure silently mints new canonicals.** If `parseJsonResponse` throws, zod rejects, or `generateCompletion` rejects, treating the result as `chosen_id: null` routes to new-insert. With `MAX_DISAMBIG_CALLS_PER_EPISODE = 5`, a single transient OpenRouter outage produces up to 5 spurious canonicals per episode that reconciliation must clean up.

## Decision

### 1. Pool-backed Drizzle client alongside the HTTP client

Introduce `src/db/pool.ts`:

- `getDbPool(): NeonDatabase<typeof schema>` — lazy singleton over `@neondatabase/serverless` `Pool` + `drizzle-orm/neon-serverless`.
- `transactional<T>(fn: (tx: NeonDatabase<typeof schema>) => Promise<T>): Promise<T>` — wraps `getDbPool().transaction(fn)`; commits on resolve, rolls back and re-throws on reject.

`src/db/index.ts` (the HTTP client) is **not** modified. Two clients coexist; the HTTP driver continues to serve all non-resolver paths (server actions, route handlers, read-only queries). The Pool client is reserved for code that needs `db.transaction()` semantics — today, only the entity resolver. Annotate `"server-only"` so client bundles can't pull it in.

### 2. Two-phase split — LLM call between two transactions

Resolver work splits into:

- **TX-1**: acquire advisory lock → exact-lookup → kNN if needed → either decide-and-commit (auto-match / pure-new-insert) or commit-pending (disambig path).
- **(lock released — outside any tx)** Build the disambiguator prompt; call `generateCompletion`; parse + zod-validate the response.
- **TX-2** (only on the disambig path): re-acquire the lock → re-run exact-lookup → bounded id-confirmation re-kNN → finalize via UPDATE/INSERT → commit.

The advisory lock is held only across fast Postgres-only steps. Document this as the canonical idiom for resolver-style code that combines a serialising lock with an LLM round-trip. Both transactions hash the same lock key (a JSON-encoded `[normalizeLabel(label), kind]` tuple — see Decision §6 for collision-safety details), so any canonical that lands during the LLM window is detected by TX-2's exact-lookup and reused.

### 3. Canonical `normalizeLabel(s) = lower(trim(s))`

Single helper exported from `src/lib/entity-resolution.ts`. Used for:

- the advisory-lock key bind,
- the `normalized_label` column write on insert,
- the exact-lookup query bind.

All three sites must agree, or whitespace variants race against the unique index. Tests assert that `"Foo"` and `" Foo "` produce identical advisory-lock SQL bind arguments.

### 4. Exact-lookup pre-kNN

After acquiring the lock — in **both** TX-1 and TX-2 — run:

```sql
SELECT id, kind FROM canonical_topics
WHERE lower(normalized_label) = $1 AND kind = $2 AND status = 'active' LIMIT 1
```

with `$1` bound to `normalizeLabel(input.label)` (already lowercased + trimmed; the `lower()` on the column side mirrors the `ct_normalized_label_kind_active_uidx` partial unique index expression in `src/db/schema.ts`). On hit, treat as auto-match (similarity := 1.0) and skip kNN entirely. This:

- handles the 91–180 day event-type gap (ADR-042 line 156),
- replaces the broken `ON CONFLICT DO NOTHING` recovery path that re-ran the same blind kNN,
- is faster than HNSW + filter for the exact-match case.

The `INSERT ... ON CONFLICT DO NOTHING` recovery on new-insert (when 0 rows are returned) calls `exactLookup` again — never another kNN.

### 5. Failure-mode discrimination on the disambiguator

Distinguish:

- **(a)** Model returned valid JSON with `chosen_id: null` (legitimate "no match" judgement) → route to new-insert in TX-2.
- **(b)** Failure → throw `EntityResolutionError` between TX-1 and TX-2 (the disambiguator runs outside the `transactional` blocks); TX-2 never opens, so no canonical or junction can be inserted on this path. Two distinct reasons are used so observability can distinguish operational from model defects: `"disambig_transport_failed"` (network / `generateCompletion` rejected — typically retryable) vs `"disambig_parse_failed"` (response was non-JSON, or zod schema rejected the shape — model misbehavior, not retryable as-is). The error surfaces to the A5 caller, which catches it (per ADR-027 / ADR-031 graceful-degradation) and continues with categories-only persistence for that one topic — one topic skipped, not the whole episode.

Treating both as `chosen_id: null` would let a transient OpenRouter outage burst spurious canonicals into the canonical set; (b) is an outage signal, not a no-match judgement.

### 6. Lock-key hash + recall budget

- `pg_advisory_xact_lock(hashtextextended($key, 0))` — 64-bit hash, per ADR-042 §"Three-tier resolution pipeline". `$key` is `JSON.stringify([normalizeLabel(label), kind])` built in JS so distinct `(label, kind)` pairs always produce distinct strings — a pipe (or any other) separator inside the label cannot collide two pairs onto the same lock.
- `SET LOCAL hnsw.ef_search = 200` is issued before each kNN query. The three constants interpolated unquoted via `sql.raw(...)` (`HNSW_EF_SEARCH`, `RECENT_EVENT_WINDOW_DAYS`, `KNN_DISAMBIG_CANDIDATE_POOL`) are validated at module load as positive-integer literals, so no user-controlled value can reach `SET LOCAL` / `LIMIT` / `interval`.

## Options Considered

- **`drizzle-orm/neon-http` only.** Rejected: no transaction support; can't hold the advisory lock across reads + writes.
- **Replace the HTTP client globally with the Pool client.** Rejected: increases connection-management surface for the entire app. The HTTP mode is correct for stateless server actions and route handlers — no need to migrate them.
- **Single transaction with the LLM call held inside.** Rejected: connection starvation + Pool head-of-line blocking under burst ingestion. The "~500ms loser latency" estimate from ADR-042 trade-offs applies to fast-path operations; with an OpenRouter round-trip multi-second p99 inside the lock, every parallel caller queues behind it.
- **Single-kNN retry on `ON CONFLICT DO NOTHING` returning 0 rows (no exact-lookup).** Rejected: can't see active-but-old event-type canonicals (the 91–180 day gap); the recovery either retries forever, throws, or attempts a duplicate insert.
- **Treat disambiguator parse failure as `chosen_id: null`.** Rejected: pollutes the canonical set on transient model errors; reconciliation must clean up after every OpenRouter blip.
- **Application-level mutex (e.g. a module-scoped `AsyncLock`).** Rejected: only serialises within one Node process; multi-instance Vercel deployments would still race against the same `(normalized_label, kind)` slot.

## Consequences

### Positive

- Advisory-lock semantics are correctly enforced without holding the lock across the LLM round-trip.
- Whitespace-variant race eliminated by the canonical `normalizeLabel` helper.
- 91–180 day event-type gap is no longer a recovery hole.
- Transient OpenRouter outages do not silently mint canonicals.
- Two clients coexisting means non-resolver paths keep their stateless HTTP semantics; only resolver-style code pays the connection-pool overhead.

### Negative

- Small connection-management surface added (one extra Pool, one extra Drizzle client).
- Minor cognitive load: two clients (HTTP + Pool), two-phase split (TX-1 → outside-tx LLM → TX-2). Accepted; the alternative (data corruption / lock starvation / duplicate canonicals) is structurally worse.

## References

- Issue: [#384](https://github.com/Chalet-Labs/contentgenie/issues/384)
- ADR-042 §"Three-tier resolution pipeline" + §"Trade-offs accepted" (line 156)
- ADR-043 §"Recall budget rationale" (`ef_search = 200`)
- ADR-031 / ADR-027 (graceful-degradation pattern)
