# ADR-046: Admin Canonical-Topic Merge / Unmerge Transaction Pattern

**Status:** Accepted
**Date:** 2026-04-30
**Issue:** [#385](https://github.com/Chalet-Labs/contentgenie/issues/385) (epic [#376](https://github.com/Chalet-Labs/contentgenie/issues/376))
**Relates to:** [ADR-042](042-canonical-topics-foundation.md), [ADR-044](044-entity-resolution-transactional-pattern.md), [ADR-031](031-episode-topics-junction-table.md), [ADR-028](028-admin-panel-architecture.md)

---

## Context

ADR-042 ratified the canonical-topic data model with the schema-level invariant `ct_merged_biconditional` (`status='merged' ↔ mergedIntoId IS NOT NULL`) and a non-nullable, ON-DELETE-RESTRICT self-FK to enforce that "merged" is a structural state, not a soft delete. ADR-044 specified how `pg_advisory_xact_lock` plus the Pool driver are used for resolver-style writes.

The reconciliation task slated for B1 in the same epic will need a deterministic, atomic merge operation — and admins need a manual escape valve right now to fix mistakes the resolver makes (two distinct canonicals that should be one, or a wrong auto-match committing a junction row to the wrong canonical). Issue #385 ships the lite admin UI plus the helper that B1 will reuse.

Three structural problems require an ADR rather than ad-hoc code:

1. **The biconditional CHECK forces a single-statement transition.** `UPDATE canonical_topics SET status='merged' WHERE id=$1` followed by a separate `UPDATE … SET merged_into_id=$2 WHERE id=$1` would make the row violate `ct_merged_biconditional` between the two statements. Postgres evaluates CHECK at row update time, so both columns must move in one statement.
2. **`UPDATE … ON CONFLICT` is not valid Postgres.** Rewriting `episode_canonical_topics` rows from `loserId` → `winnerId` would violate the partial unique index `(episodeId, canonicalTopicId)` whenever both already exist for the same episode. `INSERT … ON CONFLICT DO NOTHING` works for inserts; the merge case is different — pre-existing winner rows must win, and conflicting loser rows must be dropped.
3. **Unmerge cannot reverse the original junction state.** When the merge ran, conflicting loser rows were dropped (the winner rows already existed). The original `(episode_id, loser_id)` junction state is gone — the audit log records that the merge happened, not the rows it overwrote. Unmerge therefore needs the caller to supply the episode IDs that should be re-pointed at the loser.

A correctness defect also needs to be guarded: two admins triggering merges with swapped (A→B, B→A) loser/winner orderings can deadlock if each holds a lock keyed only on the loser. The lock key must be stable under permutation.

## Decision

### 1. Atomic biconditional UPDATE

The merge writes both columns in one `UPDATE`:

```sql
UPDATE canonical_topics
SET status = 'merged', merged_into_id = $winnerId
WHERE id = $loserId AND status = 'active'
```

The `WHERE status = 'active'` guard makes the merge idempotent under retry: a second merge attempt against the same loser is a 0-row update, not a constraint violation. The CHECK never observes an intermediate state because both columns transition in the same statement.

### 2. DELETE-conflicts-then-UPDATE junction rewrite

The junction table cannot use `INSERT … ON CONFLICT DO NOTHING` because the rows already exist on the loser side. The pattern is:

```sql
-- 1. Drop loser rows whose (episode, winner) pair already exists.
DELETE FROM episode_canonical_topics
 WHERE canonical_topic_id = $loserId
   AND episode_id IN (
     SELECT episode_id FROM episode_canonical_topics
      WHERE canonical_topic_id = $winnerId
   );

-- 2. Re-point the survivors.
UPDATE episode_canonical_topics
   SET canonical_topic_id = $winnerId
 WHERE canonical_topic_id = $loserId;
```

The two statements run inside the same transaction, so no intermediate state is observable. After (1), the partial unique `(episodeId, canonicalTopicId)` is guaranteed not to collide on (2). Aliases are copied with `INSERT … ON CONFLICT (canonical_topic_id, lower(alias)) DO NOTHING` (the established pattern from `entity-resolution.ts`), and the loser's own label is added as an alias of the winner so search continues to work.

**Why not a single combined CTE** (`WITH deleted AS (DELETE …), updated AS (UPDATE …) SELECT …`)? Postgres data-modifying CTEs all run on the _pre-statement_ snapshot — the `UPDATE` arm would still see the conflict rows the `DELETE` arm is removing and try to repoint them to `winnerId`, hitting the partial unique index. Two sequential statements inside the same transaction is the only correct shape. The advisory lock plus the transaction boundary together guarantee no other writer interleaves.

### 3. `episode_count` is recomputed on winner, zeroed on loser

After the junction rewrite, `episode_count` on the winner is re-derived from the live junction table:

```sql
UPDATE canonical_topics
   SET episode_count = (
     SELECT count(*) FROM episode_canonical_topics
      WHERE canonical_topic_id = $winnerId
   )
 WHERE id = $winnerId;
```

This is more expensive than `winner.episodeCount += loser.episodeCount - conflictCount`, but it is the only path that survives concurrent inserts during the merge transaction (a resolver writing a junction row at the same time on the winner side increases the count we should reflect). The CHECK `ct_episode_count_gte_0` continues to hold.

The loser's `episode_count` is set to `0` in the same UPDATE that flips status to `'merged'` (junctions just moved away, so the count is zero by definition). Doing it inside the biconditional UPDATE keeps the operation a single statement and prevents admin pages from showing a stale count after the merge.

### 4. Stable, permutation-safe advisory-lock key

```ts
const [a, b] = [loserId, winnerId].sort((x, y) => x - y);
sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([a, b])}, 0))`;
```

Sorting before encoding means a `(loserId=12, winnerId=7)` and a `(loserId=7, winnerId=12)` call hash to the same lock — two admins racing on the same pair serialize, regardless of who picked which side as the winner. JSON-encoding the array (rather than a `${a}|${b}` string) keeps the encoding ambiguity-free against any hypothetical future ID format.

### 5. Optional caller-supplied transaction

`mergeCanonicals` and `unmergeCanonicals` accept an optional `tx` param so the future B1 reconciliation task can compose them inside its own outer transaction without nesting `transactional()`. To keep the existing single-callsite signature ergonomic, `transactional<T>` itself is extended:

```ts
export function transactional<T>(
  fn: (tx: NeonDatabase<typeof schema>) => Promise<T>,
  options?: { tx?: NeonDatabase<typeof schema> },
): Promise<T> {
  if (options?.tx) return fn(options.tx);
  return getDbPool().transaction((tx) => fn(tx));
}
```

When `options.tx` is provided, `fn` runs inside the caller's transaction (no new BEGIN, no advisory-lock release at this scope, no commit). When omitted, behavior is unchanged.

### 6. Audit log table — `canonical_topic_admin_log`

```sql
CREATE TABLE canonical_topic_admin_log (
  id           SERIAL PRIMARY KEY,
  actor        TEXT NOT NULL,             -- Clerk userId of the admin
  action       TEXT NOT NULL,             -- 'merge' | 'unmerge'
  loser_id     INTEGER NOT NULL,          -- always the row whose status flipped
  winner_id    INTEGER NOT NULL,          -- merge target (or original target on unmerge)
  metadata     JSONB,                     -- merge: { episode_count_loser, conflicts_dropped, conflict_episode_ids[], reassigned[] }; unmerge: { episode_ids, reassigned, skipped, also_removed_from_winner }
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (action IN ('merge', 'unmerge'))
);
CREATE INDEX ON canonical_topic_admin_log (loser_id);
CREATE INDEX ON canonical_topic_admin_log (winner_id);
CREATE INDEX ON canonical_topic_admin_log (created_at DESC);
```

The `action` enum is enforced via CHECK rather than a Postgres `ENUM` type because the value set is small, audit-only, and unlikely to grow; a CHECK is cheaper to evolve than a real enum. The constants are defined in their own module — `src/db/canonical-topic-admin-log-constants.ts` — to dodge the `@/db/schema` mocking hazard documented in MEMORY.md (a runtime export added to schema.ts crashes every existing test whose `vi.mock("@/db/schema", …)` factory does not enumerate it).

The `actor`, `loser_id`, and `winner_id` columns are NOT FK constraints to `users` or `canonical_topics`. The audit log must survive deletion of the underlying row (it is the historical record of who merged what, and a merge target can be deleted later by other admin tooling). Indexes cover the two most common queries: detail page (`WHERE loser_id = ? OR winner_id = ?`) and global audit overview (`ORDER BY created_at DESC`).

### 7. Unmerge requires episode-id list from caller, removes-from-winner by default

`unmergeCanonicals(loserId, episodeIdsToReassign, actor, alsoRemoveFromWinner = true)` reverses a merge by:

1. **Non-locking probe**: `SELECT status, merged_into_id FROM canonical_topics WHERE id = $loserId` (no `FOR UPDATE`). Throw if status ≠ 'merged'. Read `previousWinnerId` from the row.
2. **Acquire the sorted advisory lock first** (matching `mergeCanonicals`' order — advisory before row locks). Lock ordering is load-bearing: a row-then-advisory order in unmerge would invert merge's advisory-then-row order and deadlock under concurrent merge+unmerge of the same pair.
3. **Re-read `FOR UPDATE` and re-validate**: `SELECT id, status, merged_into_id … FOR UPDATE`. Throw `not-merged` if status ≠ 'merged' or if `merged_into_id` differs from the probe value (a concurrent re-merge moved the loser to a different winner between the probe and the lock — the advisory lock we hold protects the wrong pair, so the safe path is to refuse and let the caller retry).
4. Atomically clearing `status='active', merged_into_id=NULL` (the biconditional CHECK still holds because both columns transition in one statement).
5. A single set-based `INSERT INTO episode_canonical_topics … SELECT … FROM unnest(ARRAY[ids]) … LEFT JOIN episode_canonical_topics prev ON …  ON CONFLICT (episode_id, canonical_topic_id) DO NOTHING` reattaches the requested episodes to the loser. matchMethod = `'auto'`, similarity = `1.0` (caller-supplied = high confidence); coverage_score is preserved from the winner's existing junction row via the LEFT JOIN, or defaults to `0.5` when no winner row exists. `RETURNING id` lets the caller compute `episodesReassigned` and `episodesSkipped` (skipped = inputs minus inserted). Single statement avoids a per-episode round-trip in the hot path.
6. **`alsoRemoveFromWinner` (default `true`).** A follow-up `DELETE FROM episode_canonical_topics WHERE canonical_topic_id = $previousWinnerId AND episode_id = ANY($episodeIdsToReassign)` runs inside the same transaction. The default is `true` because unmerge's semantic purpose is to _reverse_ the merge — leaving winner rows attached for those episodes attributes the same episode to two distinct canonicals (silent corruption). Opt-out (`false`) is supported for the rare case where an admin wants the duplication (e.g., the merge was incorrect _and_ the winner legitimately covers those episodes too), but that is the surprising path. The Zod schema on `adminUnmergeCanonicals` sets `.default(true)`.
7. Recomputing `episode_count` on both the loser (newly active) and the winner from the live junction (same recompute pattern as merge §3).
8. Writing an audit row with `action='unmerge'`, metadata including the episode-ids list, counts, and the `also_removed_from_winner` flag.

The episode-ids list is required input. The admin UI surfaces it with a multi-select that defaults to the union of `metadata.reassigned` and `metadata.conflict_episode_ids` from the latest merge audit row for this loser; the admin must explicitly confirm. Reassigned IDs are the rows that moved from loser→winner; conflict IDs are loser rows that were dropped because the winner already had them. Both are reasonable candidates for re-attachment to the loser on unmerge.

The merge writes both arrays into the audit row metadata, so the unmerge UI can pre-populate the list. This is the only "memory" of the original merge — without it, unmerge would have no way to suggest sensible defaults.

### 8. Server-action role gate

A new `withAdminAction<T>(fn)` wrapper is added to `src/lib/auth-wrapper.ts` mirroring `withAuthAction`:

```ts
export async function withAdminAction<T>(
  fn: (userId: string) => Promise<T>,
): Promise<T | { success: false; error: "Forbidden" }> {
  const { userId, has } = await auth();
  if (!userId) return { success: false, error: "Forbidden" };
  if (!has({ role: ADMIN_ROLE })) return { success: false, error: "Forbidden" };
  return fn(userId);
}
```

Returns `Forbidden` (not `Unauthorized`) for both no-session and not-admin so an authenticated non-admin cannot probe the endpoint to discover whether an admin role exists. All four new server actions wrap their bodies in `withAdminAction`. Existing inline checks in `src/app/actions/admin.ts` are not touched — that refactor is out of scope.

## Options Considered

- **Two-step UPDATE** (status, then merged_into_id). Rejected — violates `ct_merged_biconditional`.
- **`INSERT … ON CONFLICT DO NOTHING` then DELETE-loser-rows.** Rejected — the partial unique index is on the junction row, and INSERT pre-supposes the loser row does not exist; the actual case is the opposite (loser rows must be rewritten, conflicts dropped). DELETE-conflicts-first is the inverse and is correct in one transaction.
- **Pre-compute `episode_count` from `winner + loser - conflicts`.** Rejected — drifts under concurrent resolver writes during the merge transaction. Re-derived count is the only correct value.
- **Lock on `loserId` only.** Rejected — two admins racing with swapped (A→B, B→A) merges deadlock. Sorted-pair lock-key is permutation-safe.
- **Make `unmergeCanonicals` reconstruct episode IDs from the audit log.** Considered — defaults the UI suggestion list, but cannot be the source of truth: a subsequent merge of the same loser with a different winner overwrites the canonical association, and there is no general "recover the pre-merge state" operation. Caller-supplied list is the durable contract; audit log defaults are advisory.
- **Persist a real `enum` type for `action` instead of CHECK.** Rejected — a CHECK lets us drop / extend the constraint with a single `ALTER TABLE` statement. With two values this is a tie; the migration ergonomics tip it.
- **Store actor as `INTEGER` FK to `users`.** Rejected — the audit log must survive user deletion; soft-delete-of-user would otherwise leak into audit-row breakage.
- **Reuse `withAuthAction` and inline `auth().has({ role })`.** Rejected — four new actions, four call sites, all repeat the same 4-line check. A wrapper centralizes it.
- **Combined data-modifying CTE for the junction rewrite** (`WITH deleted AS (DELETE …), updated AS (UPDATE …) …`). Rejected — Postgres CTEs all run on the pre-statement snapshot, so the UPDATE arm collides on the partial unique index against the rows the DELETE arm is removing. Two sequential statements in one transaction is the only correct shape (see §2 inline note).
- **Default `alsoRemoveFromWinner: false` on unmerge.** Rejected — partial reversal that leaves the winner's junction rows attached attributes the same episode to two distinct canonicals, which is silent corruption rather than a conservative default. Reversing a merge means reversing both sides. The default is `true`; opt-out exists but is a deliberate exception.
- **Single `SELECT … FOR UPDATE` preflight before the advisory lock.** Rejected — inverts merge's advisory-then-row order and creates a deadlock window when a concurrent merge and unmerge race on the same pair. Replaced by the probe → advisory lock → `FOR UPDATE` re-validate sequence in §7 steps 1–3: the non-locking probe discovers `previousWinnerId` so the sorted-pair key is known before any lock, and the post-lock re-read closes the race window where a chained merge could move the winner between probe and lock.

## Consequences

### Positive

- The merge is atomic under the existing CHECK constraints; concurrent merges on the same pair serialize via the advisory lock; the CHECK is never observed in an intermediate state.
- The B1 reconciliation task can call `mergeCanonicals` directly with its own `tx`, sharing the entire happy path including the CHECK-respecting UPDATE and conflict-DELETE pattern.
- Audit log is the durable record of admin intervention — supports both the per-canonical detail view and a future global-audit screen.
- The `withAdminAction` wrapper closes a class of bugs (action ships without role check) that has bitten this codebase before (ADR-028 §"Layout-level authorization" was the response to a similar pattern).

### Negative

- The DELETE-conflicts-then-UPDATE pattern is two statements rather than one — clear in code, but a future contributor might be tempted to "simplify" to `UPDATE … ON CONFLICT` and discover that does not exist.
- `episode_count` recompute is O(junction rows for winner). At current scale this is sub-millisecond; if junction grows to millions of rows per canonical, the recompute becomes a hot path inside the lock.
- Unmerge is partially manual: the admin must supply the episode-ID list. The UI defaults from the audit log, but the contract is that the caller knows what they want re-pointed.
- Two new modules exist that mirror schema.ts state (`canonical-topic-admin-log-constants.ts` for action values). Justified by the mocking hazard, but it is a small split.

## References

- Issue: [#385](https://github.com/Chalet-Labs/contentgenie/issues/385)
- ADR-042 §"Invariants enforced at the DB layer" — biconditional CHECK and self-FK design
- ADR-044 §"Lock-key hash" — sorted-key encoding pattern reused here
- ADR-031 — junction-table reconciliation history
- ADR-028 — admin panel layout-level auth
- MEMORY.md "Don't add runtime re-exports to widely-mocked modules" — rationale for the constants split
