# ADR-049: Admin canonical-topics polish — drift semantics & re-summarize wrapper

**Status:** Accepted (2026-05-02)

**Related:** [ADR-042](042-canonical-topics-foundation.md), [ADR-046](046-admin-canonical-merge.md), [ADR-048](048-backfill-canonical-topics-cheap-reextract.md), spec `.dev/pm/specs/2026-04-25-canonical-topics-foundation.md`, issue #391, PR #424 (column drop).

## Context

Issue #391 (B3) was authored against an earlier draft of the canonical-topics design that included a stored `canonical_topics.episode_count` column. Two of its required surfaces were specified in terms of behaviour that no longer exists:

1. **`getCanonicalEpisodeCountDrift()`** — defined as canonicals where stored `episode_count <> COUNT(*) FROM episode_canonical_topics`. PR #424 (commit `558f7f2`) dropped that column; the count is now derived on read via the correlated-subquery helper `canonicalTopicEpisodeCount()` in `src/lib/admin/canonical-topic-episode-count.ts`. With no stored value, drift between stored and derived is structurally impossible.

2. **`triggerFullResummarize(episodeId)` with `forceFull=true`** — defined as bypassing an "existing-summary check" inside the `summarize-episode` Trigger.dev task. Inspection of `src/trigger/summarize-episode.ts` confirms there is no such short-circuit: the task always runs the full pipeline (transcript → LLM → summary → topic resolution) when triggered. The existing admin re-summarize endpoint (`src/app/api/admin/batch-resummarize/route.ts`) relies on this — it simply calls `tasks.batchTrigger("summarize-episode", …)` after looking up `podcastIndexId` from the DB row id.

The detail-page UX requirement "show stored vs computed `episode_count` discrepancy" inherits the same issue as (1).

We need a coherent set of decisions before implementing #391 so that the polish PR ships a useful drift surface and a correctly-shaped re-summarize action without re-introducing the very class of bug PR #424 was written to eliminate.

## Decision

### 1. Reframe drift detection as **merge-cleanup drift**

`getCanonicalEpisodeCountDrift()` is renamed in spirit (kept as the **server-action** name in `src/app/actions/topics.ts` for issue-traceability) but now surfaces a different invariant:

> A canonical with `status = 'merged'` MUST have zero rows in `episode_canonical_topics`.

This is the **path-compression invariant** from ADR-042 (and the DELETE-then-UPDATE mechanic in ADR-046 §2): the merge transaction relocates every junction row from loser to winner inside a single transaction with an advisory lock, and on success the loser is left with no episode references. Any merged canonical with `COUNT(episode_canonical_topics) > 0` is a real merge-pipeline bug worth investigating.

The query helper is named `getCanonicalMergeCleanupDriftQuery()` in `src/lib/admin/topic-queries.ts` and returns rows of `{ id, label, status, mergedIntoId, junctionRowCount }` where `status='merged' AND junctionRowCount > 0`, ordered by `junctionRowCount DESC`. The wrapping server action `getCanonicalEpisodeCountDrift()` keeps the issue's name to preserve audit-log/issue traceability.

The detail-page "stored vs computed" requirement is satisfied by displaying a **merge-cleanup health badge** when the current canonical is `merged` and has a non-zero junction count (one-line warning callout).

### 2. `triggerFullResummarize` is a thin wrapper, no task-schema change

We add a server action `triggerFullResummarize(episodeDbId: number)` in `src/app/actions/topics.ts` that:

1. Admin role-gates via `withAdminAction`.
2. Looks up `podcastIndexId` and `transcriptStatus` from `episodes` by DB id.
3. Refuses if `transcriptStatus !== 'available'` (returns a structured error — re-summarize without a transcript is the same failure mode the existing batch endpoint guards against).
4. Sets `summaryStatus = 'queued'`.
5. Calls `tasks.trigger<typeof summarizeEpisode>("summarize-episode", { episodeId: Number(podcastIndexId) })`.
6. Reverts `summaryStatus` to `null` if the trigger call throws (matches the existing `batch-resummarize` route's revert pattern).

No payload-schema change to `summarize-episode`. The `forceFull` flag mentioned in the issue body was speculative; the underlying invariant ("re-running the task always re-runs the full pipeline") already holds.

### 3. Bulk merge stays sequential (issue constraint, restated for clarity)

`bulkMergeCanonicals(loserIds: number[], winnerId: number)` iterates losers in input order, calling the existing `mergeCanonicals` helper inside a per-loser try/catch. Aggregate result shape:

```ts
type BulkMergeResult = {
  succeeded: number;
  failed: number;
  results: Array<
    | { loserId: number; ok: true; data: MergeCanonicalsResult }
    | { loserId: number; ok: false; error: string }
  >;
};
```

Sequential is required because each merge mutates the winner's junction rows; concurrent merges of `A→W` and `B→W` would race on the winner's junction state and the advisory lock granularity is per-pair, not per-winner.

## Consequences

**Positive**

- The "drift" surface in the polish PR catches a real, structurally meaningful bug class (incomplete merge cleanup) rather than a non-existent column mismatch.
- `triggerFullResummarize` reuses the established `batch-resummarize` pattern verbatim, no surprise behaviour for ops.
- No churn on the `summarize-episode` task input schema means no migration risk for in-flight runs at deploy time.

**Negative / accepted trade-offs**

- The server-action name `getCanonicalEpisodeCountDrift()` keeps the original issue-text name even though its semantics shift. Mitigation: ADR + JSDoc on the action explain the reframing, and the underlying query helper has a name that matches its actual job (`getCanonicalMergeCleanupDriftQuery`).
- The polish PR does not address "active canonicals with stale lastSeen" or other observability angles — those belong to B4 (extended observability). This ADR explicitly limits scope to the merge-cleanup invariant.

**Follow-ups**

- If reconciliation (B1) ever introduces a `canonical_topics_processed_at` marker column (mentioned as a structural fix in `src/trigger/backfill-canonical-topics.ts:19`), revisit whether a true "stale derived count" drift makes sense.
- Optional future work: surface dormant canonicals with `last_seen` newer than the dormancy threshold (potential decay-job bug) — not in scope for #391.
