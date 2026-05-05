# ADR-053: Extended Observability Dashboards — Trends, Drift Detection, Reconciliation Audit

**Status:** Proposed
**Date:** 2026-05-05
**Issue:** [#392](https://github.com/Chalet-Labs/canonical-topics/issues/392) (part of epic [#376](https://github.com/Chalet-Labs/contentgenie/issues/376))
**Spec:** `.dev/pm/specs/2026-04-25-canonical-topics-foundation.md` (Approved; B4 row in EPIC B)
**Relates to:** [ADR-046](046-admin-canonical-merge.md), [ADR-047](047-resolution-observability-junction-as-source.md), [ADR-050](050-canonical-topics-reconciliation-clustering.md)

---

## Context

[ADR-047](047-resolution-observability-junction-as-source.md) shipped the **lite** observability surface (#387 / A9): three cards reading directly from `episode_canonical_topics` over a rolling 24h/7d/30d window. Section §4 explicitly deferred trend-over-time, drift detection, and the reconciliation merge audit to B4 (#392) — this ADR fills that scope.

[ADR-050](050-canonical-topics-reconciliation-clustering.md) shipped the nightly reconciliation pipeline (#389 / B1). The pipeline's per-cluster outcomes — winner pick, pairwise verify results, merges executed, merges rejected — are emitted as `logger.info`/`logger.warn` lines today. Trigger.dev's Management API does not expose log payloads, only run metadata, and log retention is 7 days on dev / 30 days on prod ([ADR-047 §1](047-resolution-observability-junction-as-source.md#decision)). The audit dashboard cannot read those logs back.

Three structural questions force decisions that warrant an ADR:

1. **Where does the reconciliation audit data live?** Trigger.dev logs are not queryable; the dashboard needs a queryable store. Add a new table, query the existing `canonical_topic_admin_log` (which records merges as a side-effect of `mergeCanonicals`), or compute audit rows on demand from junction state? Each has different fidelity.
2. **What chart library?** ADR-047 §4 deferred this to B4 with the qualifier "may justify Recharts then." The codebase still has no chart library; the failure-trend card uses a plain `<Table>` (`src/components/admin/overview/failure-trend-card.tsx`). The issue's Implementation Guide §4 explicitly says "use existing chart library if present, else simple inline SVG / Tailwind bar lists" — explicit license to keep things simple.
3. **Index strategy on `episode_canonical_topics(updated_at)`.** ADR-047 §"trade-offs accepted" punted this. Trend queries with `date_trunc + GROUP BY` over a 30-day window may force the index now. Decide with measurement, not guesses.

A fourth concern: **per-cluster collection in the reconciliation orchestrator**. The existing `ReconcileSummaryAccumulator` (`src/trigger/helpers/reconcile-summary-accumulator.ts`) aggregates counters only — it does not capture per-cluster context (winner id, loser ids, outcome). Extending the accumulator vs. introducing a parallel `ClusterAuditCollector` is a small but real architectural fork.

A fifth concern: **the schema-mock hazard from `MEMORY.md`**. Adding a new export to `@/db/schema` is safe in isolation, but module-level constants for drift thresholds and audit-row outcome enums must NOT live in `@/db/schema` lest a widely-mocked test factory crash on the new export. ADR-046 §6 already established the constants-split pattern (`canonical-topic-admin-log-constants.ts`); this ADR follows it.

A sixth concern: **`date_trunc` is not used anywhere in the codebase yet.** The closest precedent (`src/lib/admin/overview-queries.ts:139–167`) uses `DATE(updated_at)` + JS zero-fill. Introducing `date_trunc` for hour/day/week granularity is a deliberate first instance and warrants documenting.

## Decision

### 1. New `reconciliation_log` table — one row per cluster the orchestrator touched

```ts
export const reconciliationLog = pgTable(
  "reconciliation_log",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id").notNull(),
    clusterIndex: integer("cluster_index").notNull(),
    clusterSize: integer("cluster_size").notNull(),
    winnerId: integer("winner_id"),
    loserIds: integer("loser_ids").array().notNull(),
    verifiedLoserIds: integer("verified_loser_ids").array().notNull(),
    rejectedLoserIds: integer("rejected_loser_ids").array().notNull(),
    mergesExecuted: integer("merges_executed").notNull(),
    mergesRejected: integer("merges_rejected").notNull(),
    pairwiseVerifyThrew: integer("pairwise_verify_threw").notNull(),
    outcome: text("outcome")
      .$type<"merged" | "partial" | "rejected" | "skipped" | "failed">()
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("rl_run_id_idx").on(table.runId),
    index("rl_winner_id_idx").on(table.winnerId),
    index("rl_created_at_idx").on(sql`${table.createdAt} DESC`),
    check(
      "rl_outcome_enum",
      sql`${table.outcome} IN ('merged', 'partial', 'rejected', 'skipped', 'failed')`,
    ),
  ],
);
```

**Why not `canonical_topic_admin_log`?** The admin log records one row per `mergeCanonicals` call (loser*id + winner_id), already populated by reconciliation since ADR-046 §6 (`actor: 'reconcile-canonicals'`). It is fine for reconstructing \_which* merges happened, but it does not capture cluster context: cluster size, the rejected losers DBSCAN proposed but the LLM declined, the verify-throw failures that were silently dropped. The audit dashboard's value is showing _why a cluster did or did not produce merges_ — admin-log rows alone leave that gap. We keep both: admin log = one row per actual merge (audit of the DB write); reconciliation log = one row per cluster (audit of the LLM judgement loop).

**Why not derive on demand?** The DBSCAN clustering, winner-pick, and pairwise-verify outputs are not idempotent (the LLM is non-deterministic, and even a fresh DBSCAN run could partition differently after concurrent resolver inserts). Re-running them to "audit" would be wrong-by-construction — the displayed cluster would not be the one the historical run saw.

**Why per-cluster, not per-merge?** The issue body acceptance criterion lists "per-cluster: timestamp, cluster size, winner id, loser ids, merges executed/rejected" — exactly the row shape above. Per-merge would multiply rows by `1 + (size-1)` per cluster with no information gain (the loser_ids array on the cluster row already enumerates each pair).

**Outcome enum.** Five values, derived in the orchestrator before the row is written:

- `merged` — winner picked, every loser verified, every verified loser successfully merged.
- `partial` — winner picked, some losers verified `same_entity=true` and merged, others verified `false` (or threw and were treated as `false`).
- `rejected` — winner picked, but every loser verified `false` (or threw). `mergesRejectedByPairwise` is incremented at most once for this cluster ([ADR-050 §2](050-canonical-topics-reconciliation-clustering.md#decision)). The cluster's grouping claim was rejected outright.
- `skipped` — winner-pick returned `null`/out-of-cluster, OR the winner was already merged as a loser in a prior cluster (`clustersSkippedWinnerAlreadyMerged`).
- `failed` — exception in any phase. Phase context is logged via the existing `reconcile_cluster_failed` warn line; the row outcome is the durable signal.

The enum is a CHECK constraint, not a `pgEnum` — same rationale as ADR-046 §6: small fixed set, audit-only, cheaper to evolve via `ALTER TABLE`.

**Indexes.** Three indexes mirror the query shape: `runId` (group rows by run), `winnerId` (per-canonical drilldown — same access pattern as `canonical_topic_admin_log.winner_id`), `created_at DESC` (audit list ORDER BY). No FK on `winnerId` or `loserIds[]` — the audit must survive canonical deletion (same constraint as ADR-046 §6 on the admin log).

### 2. Stay with simple visualizations — no chart library installed

ADR-047 §4 said "may justify Recharts then" for B4. We choose not to. Rationale:

- The four new visualizations all reduce to **categorical bars + a heatmap-style grid + a banner + a table** — every shape that needs to render is achievable with Tailwind grid, `<Progress>`, and inline SVG (for the heatmap cell-color ramp).
- Recharts adds ~80 KB gzipped to the admin bundle. The observability page is server-rendered (`force-dynamic`) and admin-gated; it has zero performance budget pressure, but Recharts also pulls in React DOM peer-deps that we'd be installing for one page.
- Stories like `failure-trend-card.tsx` already establish "render trend data as a `<Table>`" as the project precedent. We extend that idiom, we don't break it.
- Issue Implementation Guide §4 is an explicit license: "use existing chart library if present, else simple inline SVG / Tailwind bar lists."

Concretely:

- **Match-method trend (per day).** Stacked horizontal bars, one row per day, three colored segments (auto / llm_disambig / new) sized by percentage. Pure Tailwind div widths.
- **Similarity trend (per day).** Heatmap-style grid: rows = days, columns = similarity buckets (0.00, 0.05, …, 0.95), each cell colored by count via Tailwind opacity classes (`bg-primary/10`, `/20`, `/30`, …, `/100` mapped to count quartile). No external library; the count→color mapping is a pure function.
- **Drift banner.** Single `<Card>` with conditional `bg-` class (`bg-green-500/10` / `bg-yellow-500/10` / `bg-red-500/10`), an icon (`CheckCircle` / `AlertTriangle` / `AlertOctagon` from `lucide-react` — already imported elsewhere), and the reason text inline.
- **Audit list.** `<Table>` from `src/components/ui/table.tsx`. Columns: timestamp, cluster size, winner, losers (verified + rejected counts), outcome badge.

Recharts can be revisited in a future ADR if a new visualization (e.g., a sparkline that doesn't fit the horizontal-bar idiom) demands it.

### 3. Index `episode_canonical_topics(updated_at)` — defer to measurement, not preemptive

ADR-047 §"trade-offs accepted" punted this until ~1M junction rows. The trend queries (`date_trunc('day', updated_at) GROUP BY 1`) over a 30-day window will seq-scan the junction even at lower scale. At current ingestion rate (~hundreds–thousands of resolutions per day), 30 days is ~hundreds-of-thousands of rows — sub-second on Neon, but the seq scan is observable in `EXPLAIN ANALYZE`.

**Decision: do not add the index in this ADR.** The page is `force-dynamic`, admin-gated, hit ~tens of times per day at most. A sub-second seq scan is fine. If post-launch profiling shows the page latency exceeds the 1.0s admin-page p95 budget, a follow-up adds `CREATE INDEX CONCURRENTLY ect_updated_at_idx ON episode_canonical_topics (updated_at)` — `CONCURRENTLY` matters because the junction is hot on the resolver's write path. The index is a one-line follow-up, not a blocker.

The boundary is captured in the plan as 🟡 "pause and confirm with lead" for adding the index — we ship without it.

### 4. Extend `ReconcileSummaryAccumulator` to collect per-cluster audit rows

The accumulator already centralizes per-run state. Adding a `clusterAudits: ClusterAuditRow[]` field with a single `recordClusterAudit(row)` setter is ~20 LOC. The orchestrator (`runCluster` in `src/trigger/helpers/reconcile-canonicals.ts`) already builds the relevant context (winner id, verified losers, rejected losers, outcome derivation); it calls `accum.recordClusterAudit(...)` once per cluster at end-of-cluster.

The top-level task (`src/trigger/reconcile-canonicals.ts`) gains one new step _between_ `runReconciliation` returning and `logger.info("reconcile_summary", …)` emitting:

```ts
const summary = await runReconciliation({ ... });
const audits = summary.clusterAudits;
if (audits.length > 0) {
  await insertReconciliationAuditRows(db, runId, audits);
}
logger.info("reconcile_summary", { event: "reconcile_summary", ...summary });
```

The `runId` is generated in the top-level task (e.g. `crypto.randomUUID()`), passed into `runReconciliation` for inclusion on each row. `insertReconciliationAuditRows` is a single `db.insert(reconciliationLog).values(rows)` — bulk insert, no per-row round-trips. If the insert throws, we log `reconcile_audit_persist_failed` and re-throw — losing audit rows is not a correctness defect for the resolver, but it is a regression from the day-1 contract this ADR introduces, so the operator must see it.

**Why extend, not introduce a parallel `ClusterAuditCollector`?** Two collectors mean two state objects threaded through `runCluster`, doubling the closure surface. The accumulator is already the single place per-run state lives — adding cluster audits to it keeps the contract minimal.

**Schema invariant.** `clusterAudits.length === clustersSeen + clustersDeferred`? No — `clustersDeferred` counts clusters _not_ entered (budget guard). `clusterAudits.length === clustersSeen` exactly. Tests assert this invariant.

### 5. `detectThresholdDrift` constants live in a dedicated module

Following ADR-046 §6, ADR-050 §"Negative" (the `reconcile-constants.ts` split), and the `MEMORY.md` schema-mock hazard, drift thresholds live in `src/lib/observability/drift-thresholds.ts`:

```ts
export const DRIFT_AUTO_RATE_FLOOR = 0.4; // alert below
export const DRIFT_AUTO_RATE_WARN = 0.55; // warn below
export const DRIFT_DISAMBIG_RATE_CEILING = 0.4; // alert above
export const DRIFT_DISAMBIG_RATE_WARN = 0.3; // warn above
```

Spec Open Question #1 names the healthy band as "60–80% auto / 15–30% disambig / 5–15% new". The alert thresholds match the issue's acceptance criterion verbatim (`< 0.40 / > 0.40`); the warn thresholds are derived from the lower edge of the healthy auto band (0.55 ≈ midway between 0.40 and 0.60) and the upper edge of the disambig band (0.30, the spec target ceiling). Operators retune these in this module — no schema change.

`detectThresholdDrift` returns:

```ts
type DriftStatus = "ok" | "warn" | "alert";
interface DriftResult {
  status: DriftStatus;
  reason: string;
  rates: { auto: number; disambig: number; new: number; total: number };
}
```

Empty window (`total === 0`) returns `{ status: "ok", reason: "No resolutions in window" }`. Alert wins over warn when both fire.

### 6. `date_trunc` is the trend-bucketing helper — first instance in the codebase

```ts
const granularitySql = sql.raw(granularity === "day" ? "'day'" : "'week'");
const bucket = sql<string>`date_trunc(${granularitySql}, ${col})`.mapWith(
  (v) => new Date(String(v)),
);
```

`granularity` is constrained at the call site (`parseAsStringLiteral(["day", "week"])` extension to the existing search-params loader) so `sql.raw` interpolation is safe — there is no user-supplied SQL fragment in scope. `date_trunc` is idiomatic Postgres, and the bucket boundaries it produces (00:00 UTC of the day) align with the rolling-window math in `windowFromKey` (boundaries are computed UTC-side in `Date.getTime()` arithmetic). Zero-fill on the application side mirrors `getFailureTrend`'s pattern: walk the expected day/week boundaries, look up the count from a `Map`, default to `0`.

**Why not `DATE(...)`?** `DATE(updated_at)` casts to `date` (no time component); `date_trunc('day', updated_at)` casts to `timestamp` (00:00:00 of the day). For `granularity: "week"` we need the latter — `date_trunc('week', ...)` is Postgres's ISO-week-Monday boundary, no JS-side equivalent of `DATE()` exists. Standardizing on `date_trunc` for both day and week keeps the helper uniform.

### 7. Search-params loader gains `granularity` and is shared by trend functions

`src/lib/search-params/admin-topics-observability.ts` adds:

```ts
export const GRANULARITY_KEYS = ["day", "week"] as const;
export type GranularityKey = (typeof GRANULARITY_KEYS)[number];

export const adminTopicsObservabilitySearchParams = {
  window: parseAsStringLiteral(WINDOW_KEYS).withDefault("7d"),
  granularity: parseAsStringLiteral(GRANULARITY_KEYS).withDefault("day"),
};
```

`getMatchMethodTrend(window, granularity)` and `getSimilarityTrend(window, granularity)` accept the validated literal directly — no string-passthrough.

### 8. New module split — reconciliation audit query lives outside `resolution-metrics.ts`

`src/lib/observability/resolution-metrics.ts` reads the resolution junction (`episode_canonical_topics`). The reconciliation audit reads a different table (`reconciliation_log`). A single module conflates concerns; module-level state and test mocks would collide.

**Decision: new module `src/lib/observability/reconciliation-audit.ts`** exporting `getReconciliationAuditLog(window)`. Co-located tests in `src/lib/observability/__tests__/reconciliation-audit.test.ts` and `reconciliation-audit.integration.test.ts`. Page imports the function alongside `getMatchMethodTrend` etc.

## Consequences

### Positive

- The reconciliation audit is queryable from the database, not from log retention — the dashboard surfaces audit data for the lifetime of the rows, not the 7/30-day Trigger.dev log window.
- Per-cluster granularity preserves the LLM judgement context (verified vs. rejected losers) that `canonical_topic_admin_log` cannot capture. The two logs complement, not duplicate.
- Visualization stays in the project's existing idiom (Tailwind / Progress / Table) — no new dependency, no bundle bloat, no first-time-Recharts learning curve.
- Drift thresholds are a tunable constants module — operators retune by editing a single file; no schema or migration churn.
- `date_trunc` is introduced as a documented first-use, with a safe interpolation pattern (`sql.raw` over a literal-narrowed string). Future trend queries follow this template.
- Module split (`reconciliation-audit.ts` vs. `resolution-metrics.ts`) keeps each query function under 100 LOC and isolates the test-mock surfaces.

### Negative

- The `reconciliation_log` table is a new write path on the nightly task. A failure to insert audit rows does not corrupt reconciliation results — merges still commit transactionally — but it does break the audit invariant the dashboard depends on. Mitigated by the orchestrator's bulk-insert + `reconcile_audit_persist_failed` log signal.
- The outcome enum is derived in the orchestrator, not the database. A future code change that reorders Phase 4 / Phase 5 could mis-derive `partial` vs. `rejected`. Mitigated by a paired unit test on the derivation function.
- Without an `updated_at` index on the junction, the trend queries seq-scan a growing table. We accept this until measurement justifies the index. Operators who notice page latency degrade should file a follow-up.
- Stacked-bar trend visualizations and the heatmap grid are built ad-hoc, not from a chart library. Future visualizations may need primitives this ADR doesn't ship; ADR-052 (or whichever) reopens the Recharts question if the ad-hoc shapes accumulate.
- Adding `granularity` to the search-params loader changes the URL surface (`?window=7d&granularity=day`). Existing bookmarks without the param fall back to the default (`day`); no breakage, but operator URLs do change.

### Trade-offs accepted

- We do not persist run-level summary fields (`durationMs`, `dormancyTransitions`, `episodeCountDrift`, etc.) into `reconciliation_log`. The `reconcile_summary` Trigger.dev log line still emits them; the dashboard's audit section does not show them. If a future need arises, a sibling `reconciliation_run` table can be added — same row-level granularity decision as ADR-047 §1 punts shadow tables until they are needed.
- We do not version the `reconciliation_log` schema beyond Drizzle's standard migration flow. If the per-cluster contract changes (e.g., adding `embeddingDistance: real`), it is a column add via `db:generate`. The runId field provides a lookup key for forward compatibility.
- We do not surface "partial-accept rate" or "verify-throw rate" as their own panel. They are reconstructible from the audit rows post-hoc; ADR-050 §2 cites the same trade-off for the underlying counters.

## References

- Issue: [#392](https://github.com/Chalet-Labs/canonical-topics/issues/392)
- Spec: `.dev/pm/specs/2026-04-25-canonical-topics-foundation.md` (B4 row in EPIC B)
- [ADR-046](046-admin-canonical-merge.md) §6 — `canonical_topic_admin_log` table shape and CHECK-vs-pgEnum trade-off (replicated in §1 above)
- [ADR-047](047-resolution-observability-junction-as-source.md) §"trade-offs accepted" — punted `updated_at` index decision (§3 above accepts the punt)
- [ADR-047](047-resolution-observability-junction-as-source.md) §4 — explicit deferral of Recharts to B4 (§2 above declines the deferral)
- [ADR-050](050-canonical-topics-reconciliation-clustering.md) §2 — pairwise partial-accept; outcome derivation in §1 above mirrors this
- [ADR-050](050-canonical-topics-reconciliation-clustering.md) §"Negative" — `reconcile-constants.ts` split establishes the constants-out-of-schema pattern (§5 above replicates)
- `src/components/admin/overview/failure-trend-card.tsx` — table-as-trend project precedent (§2 above extends the idiom)
- `src/lib/admin/overview-queries.ts` `getFailureTrend` — closest time-series query precedent (§6 above generalizes to `date_trunc`)
- `MEMORY.md` "Don't add runtime re-exports to widely-mocked modules" — rationale for the constants-module split in §5
