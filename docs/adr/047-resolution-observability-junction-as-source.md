# ADR-047: Resolution observability — junction-as-source, with one boolean column for version-token-forced disambig

**Status:** Accepted
**Date:** 2026-04-30
**Issue:** [#387](https://github.com/Chalet-Labs/contentgenie/issues/387) (part of epic [#376](https://github.com/Chalet-Labs/contentgenie/issues/376))
**Relates to:** [ADR-042](042-canonical-topics-foundation.md), [ADR-044](044-entity-resolution-transactional-pattern.md), [ADR-045](045-canonical-topic-resolver-orchestration.md), [ADR-022](022-trending-topics-snapshot.md), [ADR-028](028-admin-panel-architecture.md)

---

## Context

[ADR-042](042-canonical-topics-foundation.md) §"Admin merge and observability ship with EPIC A" mandates that `match_method` histograms, similarity logging, and a minimal admin dashboard ship the moment ingestion starts. [ADR-045](045-canonical-topic-resolver-orchestration.md) §6 pinned the structured-log shape that the orchestrator emits per episode (`matchMethodDistribution`, `versionTokenForcedDisambig`, `candidatesConsidered`, etc.) and explicitly deferred the dashboard consumer to issue #387.

Two structural questions for the dashboard layer:

1. **Storage shape.** Do we add a new `resolution_metrics` table that the orchestrator writes to, or do we read the metrics directly from the existing `episode_canonical_topics` junction (which already stores `match_method`, `similarity_to_top_match`, `coverage_score`, `created_at`)?
2. **`versionTokenForcedDisambig` persistence.** The orchestrator computes this boolean per resolution and surfaces it in the structured log line, but it is **not** currently persisted on the junction. Trigger.dev logs are write-only from a query perspective (the Management API exposes run metadata, not log payloads), so a dashboard cannot read this signal back from logs. Do we add a junction column, a new metrics table, or rely on Trigger.dev structured logs and accept the dashboard can't surface it?

## Decision

### 1. The junction is the metric source — no shadow `resolution_metrics` table

`episode_canonical_topics` already stores one row per resolution outcome with the exact dimensions the dashboard needs:

- `match_method` (`'auto' | 'llm_disambig' | 'new'`) — drives the match-method histogram.
- `similarity_to_top_match` (real, nullable) — drives the similarity histogram.
- `updated_at` (timestamp, advances on `ON CONFLICT DO UPDATE`) — drives the time-window filter so retries and recovery-path re-resolutions land in the window where they were observed. `created_at` is preserved as the first-write timestamp for audit. See §3 for the rollout/backfill details.

Adding a parallel `resolution_metrics` table would:

- Duplicate the canonical record for the lifetime of the row.
- Introduce a write-amplification path (orchestrator writes both junction and metric row) with no atomicity guarantee unless we wrap both inserts in the same transaction — which means re-architecting `insertJunction`'s callers (eight call sites across `entity-resolution.ts` and `database.ts`).
- Force a retention/cleanup policy decision day one (junction rows live forever; metrics typically don't).
- Add a second source of truth that can drift from the junction under merges (ADR-042 §"Path compression" mutates junction rows on merge).

For v1 — `match_method` distribution + similarity histogram + version-token-forced count over 24h/7d/30d windows — junction-as-source is structurally simpler, has zero write amplification, and inherits whatever consistency the junction already has (including merge semantics).

The "lite" qualifier in the issue title is the operative word: B4 (#391) ships trend-over-time, threshold drift detection, and reconciliation merge audit. If those layers ever need a dedicated metrics table (because the junction can't carry their dimensions, e.g. per-call LLM cost), the migration cost is bounded — we add the table then, not now.

### 2. Add one boolean column `version_token_forced_disambig` to the junction (small migration)

The orchestrator already computes this signal per resolution and threads it through `ResolveTopicResult.versionTokenForcedDisambig`. The structured log line includes it. The junction does not.

Two options to make it queryable:

- **Add a junction column.** One small migration: `ALTER TABLE episode_canonical_topics ADD COLUMN version_token_forced_disambig boolean NOT NULL DEFAULT false`. Backfill is implicit (`DEFAULT false` covers existing rows; the resolver has been live <1 week so the population is small). Orchestrator passes the boolean through `insertJunction(...)` like the other dimensions.
- **Read structured logs via Trigger.dev API.** The Management API does not expose log payloads; only run metadata. Even if it did, scanning logs every dashboard load would be O(runs) latency (5–30s typical) and would fail closed on log retention windows (Trigger.dev defaults to 7-day retention on dev, 30-day on prod). The dashboard would silently lose this dimension as runs aged out.

We pick the column. Cost: ~10 LOC (`schema.ts` + the migration + threading the boolean through `finalizeMatch` → `insertJunction` and the three call sites in `forceInsertNewCanonical`). All existing call sites that today set `versionTokenForcedDisambig: false as const` in their result tuple already know the right value to pass.

The column is `NOT NULL DEFAULT false` because:

- `false` is the dominant case (most resolutions don't trigger the version-token gate).
- Allowing NULL would force dashboard queries to handle a third state ("unknown") that has no semantic meaning post-migration.
- The default also covers the small population of pre-migration rows without an explicit backfill.

### 3. Time-window queries filter on `episode_canonical_topics.updated_at` (advances on conflict)

Three rolling windows: `24h` (last 24 hours), `7d` (default), `30d` — each computed as `start = now − N×24h, end = now`. Selector is server-rendered via nuqs `parseAsStringLiteral` per the existing `src/lib/search-params/admin-episodes.ts` pattern; the page re-renders on each link click, no client-side state.

The junction is the metric source, but `insertJunction` uses `ON CONFLICT (episode_id, canonical_topic_id) DO UPDATE` so the latest resolution outcome wins for the metric fields on retries and recovery-path re-resolutions. To make those re-resolutions visible in the rolling-window cards, the junction carries an `updated_at` column that advances to `now()` on every conflict (alongside the `created_at` that records the first write). Time-window queries filter on `updated_at` — a row's metrics are counted in the window where they were last observed, not the window of the original write. Without this, a pair first inserted outside the window and re-resolved inside it would have its metric fields updated but the row filtered out by `created_at`.

We use junction timestamps (not `episodes.processedAt`): the junction's own timestamps describe the resolution event we care about, and merges that reparent rows preserve them. Filtering on `episodes.processedAt` would entangle the metric with episode-summary scheduling.

**Backfill on rollout.** Because this project uses `drizzle-kit push` (not `migrate`), the migration's nullable-then-default sequence is flattened into a single `ALTER TABLE ... ADD COLUMN updated_at timestamp NOT NULL DEFAULT now()`. Every legacy row reads `updated_at = ALTER TABLE timestamp` until backfilled, which would inflate 24h/7d/30d cards with historical rows for up to 30 days. The deploy procedure must run `scripts/backfill-junction-updated-at.sql` immediately after `bun run db:push` (with the resolver paused) so legacy rows reset to `updated_at = created_at`. See ADR-026 §"Backfill via appended SQL" for the same pattern.

### 4. Dashboard layer uses simple UI primitives + `<Progress>`, not Recharts

The existing repo has `src/components/ui/progress.tsx` but no `chart.tsx`. The "lite" scope of #387 — three cards with simple histograms — does not justify the Recharts bundle (~80KB gzipped) or the shadcn `chart` install. Implementation sticks to existing UI primitives, with `<Progress>` used anywhere a bar visualization is needed:

- Match-method card: three percentages with a `<Progress>` bar each (auto / llm_disambig / new).
- Similarity histogram: 20 buckets in 0.05 steps, displayed as a horizontal row list using the shared `<Progress>` component. Buckets are labeled by their start value (`0.00`, `0.05`, …, `0.95`), with exact `1.00` values folded into the `0.95` bucket.
- Version-token-forced card: `forced / total` ratio rendered as a single percentage with a `<Progress>` bar.

B4 (#391) brings trends-over-time and may justify Recharts then; this ADR is silent on B4.

### 5. Page is auth-gated through the existing `(app)/admin/layout.tsx`

`src/app/(app)/admin/layout.tsx` already redirects non-admins to `/dashboard` (Clerk `has({ role: ADMIN_ROLE })`). The new page lives under that layout (`src/app/(app)/admin/topics/observability/page.tsx`) and inherits the guard. No per-page auth check duplication; no 404 fork (the issue's "404" wording is satisfied by the layout-level redirect, which is the existing pattern).

### 6. Metrics module is a thin query wrapper, not a service

`src/lib/observability/resolution-metrics.ts` exports four pure functions:

```ts
recordResolutionMetric(record: ResolutionMetricRecord): Promise<void>
getMatchMethodHistogram(window?: { start: Date; end: Date }): Promise<{ auto: number; llm_disambig: number; new: number }>
getSimilarityHistogram(window?: { start: Date; end: Date }, bucketSize?: number): Promise<{ bucket: number; count: number }[]>
getDisambigForcedCount(window?: { start: Date; end: Date }): Promise<{ versionTokenForced: number; total: number }>
```

`recordResolutionMetric` is a no-op in v1 (it exists to satisfy the issue's API contract and to give B4 a single insertion point if the storage layer ever adds a separate table). The orchestrator already writes the dimensions via the junction — no second write path is needed. We document the no-op explicitly in the function's JSDoc so future developers don't think it's broken.

The query functions follow the `src/lib/admin/overview-queries.ts` pattern: `db.select({...}).from(episodeCanonicalTopics)...` with `count()`, `sql<number>`...`mapWith(Number)`, and conditional `where(and(gte, lte))` for the time window.

## Consequences

### Positive

- One source of truth for resolution outcomes (the junction). No write amplification, no consistency drift on merges.
- Single small migration (one boolean column, NOT NULL DEFAULT false) keeps the production schema change minimal and the rollback trivial (`DROP COLUMN`).
- The dashboard reads from production data, not from log retention — observability holds for the lifetime of the rows, not the lifetime of the Trigger.dev log window.
- `recordResolutionMetric` is documented as a no-op stub, satisfying the issue's API surface without inventing a parallel write path that nothing reads.
- Existing admin auth pattern is reused unchanged; no per-page guard duplication.

### Negative

- The `recordResolutionMetric` no-op is a piece of API surface that does nothing. Future readers may be surprised. Mitigated by JSDoc on the function and a comment in the issue's PR.
- Adding a column requires touching every `insertJunction` caller (eight call sites) to thread the boolean through. The existing call sites already know the value (it's in `ResolveTopicResult`); this is mechanical but spreads a small change across two files (`entity-resolution.ts` and `database.ts`).
- B4 (#391) cannot easily add `candidates_considered` distribution without either also persisting it to the junction (another column) or introducing the metrics table this ADR rejected. Accepted: deferring that decision to B4 keeps v1 minimal.

### Trade-offs accepted

- We do not persist `candidates_considered` to the junction in v1, even though ADR-045 §6 logs it. The dashboard surfaces only `match_method`, similarity, and `version_token_forced_disambig` — the three the issue explicitly asks for. If B4 wants a kNN-survivor-pool histogram, it adds the column then.
- We do not add an index on `updated_at` in v1. The junction is small (one row per resolved topic per episode, ~hundreds-to-thousands per day at steady state) and PostgreSQL's seq-scan over a date range under 30 days is sub-second at this scale. If/when the table crosses ~1M rows, B4 (or its follow-up) adds `CREATE INDEX ect_updated_at_idx ON episode_canonical_topics (updated_at)`.

## References

- Issue: [#387](https://github.com/Chalet-Labs/contentgenie/issues/387)
- ADR-022 — observability dashboard precedent (trending topics).
- ADR-028 — admin panel architecture (auth-gated layout pattern).
- ADR-042 §"Admin merge and observability ship with EPIC A" — the day-1 observability requirement.
- ADR-044 — `insertJunction` is the single junction-write site this ADR augments.
- ADR-045 §6 — the structured-log shape this ADR makes queryable.
- Spec: `.dev/pm/specs/2026-04-25-canonical-topics-foundation.md` (Approved).
