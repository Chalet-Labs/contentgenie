/**
 * Repository-style SQL helpers for the nightly canonical-topic reconciliation
 * pipeline.
 *
 * Each helper accepts the minimal slice of the Drizzle client it actually
 * needs — `DbExecutor` (`execute`) for raw-SQL helpers, `DbInserter`
 * (`insert`) for query-builder writes such as `insertReconciliationAuditRows`.
 * Narrowing the surface lets fakes type-check without `as unknown as` casts
 * and keeps helpers independent of the full Drizzle client and the
 * orchestrator's `ReconcileDeps` bag.
 */

import { sql } from "drizzle-orm";

import type { db as RealDb } from "@/db";
import { reconciliationLog } from "@/db/schema";
import { coerceEmbedding } from "@/trigger/helpers/coerce-embedding";
import {
  RECONCILE_DECAY_DAYS,
  RECONCILE_DECAY_KINDS,
  RECONCILE_LOOKBACK_DAYS,
} from "@/lib/reconcile-constants";
import type { ReconcileMember } from "@/lib/prompts/reconcile-winner-pick";
import type { ClusterAuditRow } from "@/trigger/helpers/reconcile-summary-accumulator";

export type DbExecutor = Pick<typeof RealDb, "execute">;
export type DbInserter = Pick<typeof RealDb, "insert">;

/**
 * `embedding === null` indicates the row failed `coerceEmbedding`'s finite-value
 * guard (NaN / non-finite / empty / zero-norm / unrecognised driver shape).
 * Callers that care about the dropped count must surface it themselves — this
 * helper does not filter the rows.
 */
export interface RawCanonicalRow {
  id: number;
  label: string;
  kind: ReconcileMember["kind"];
  summary: string;
  embedding: number[] | null;
}

/**
 * Phase 1 — fetch active canonicals seen in the last `RECONCILE_LOOKBACK_DAYS`
 * with their identity embeddings.
 */
export async function fetchActiveCanonicals(
  database: DbExecutor,
): Promise<RawCanonicalRow[]> {
  const result = await database.execute<{
    id: number;
    label: string;
    kind: ReconcileMember["kind"];
    summary: string;
    identity_embedding: unknown;
  }>(
    sql`SELECT id, label, kind, summary, identity_embedding
        FROM canonical_topics
        WHERE status = 'active'
          AND last_seen > now() - (${RECONCILE_LOOKBACK_DAYS}::int * INTERVAL '1 day')`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    kind: row.kind,
    summary: row.summary,
    embedding: coerceEmbedding(row.identity_embedding),
  }));
}

/**
 * Same source of truth as the read-side `episode_count` derivation everywhere
 * else in the app (PR #424 / ADR-050 §4). Called from Phase 5 for the
 * pre-merge snapshot.
 */
export async function countEpisodesForCanonical(
  database: DbExecutor,
  canonicalId: number,
): Promise<number> {
  const result = await database.execute<{ count: number | string }>(
    sql`SELECT count(*)::int AS count
        FROM episode_canonical_topics
        WHERE canonical_topic_id = ${canonicalId}`,
  );
  const raw = result.rows[0]?.count ?? 0;
  return typeof raw === "number" ? raw : Number(raw);
}

/**
 * Phase 7 — flip event-type canonicals to dormant when `last_seen` is older
 * than `RECONCILE_DECAY_DAYS`. Topic-type kinds (`concept`, `work`) are
 * excluded by the kind filter; `ongoing=true` is exempt by predicate.
 */
export async function decayStaleCanonicals(
  database: DbExecutor,
): Promise<number> {
  // Drizzle does not serialize a JS array as a Postgres array when passed as a
  // bound param — `${kinds}::canonical_topic_kind[]` produces
  // `($1, $2, ...)::canonical_topic_kind[]` (a record cast), which Postgres
  // rejects at runtime. Build the array literal explicitly with `sql.join`,
  // mirroring the pattern in `mergeCanonicals` (src/trigger/helpers/database.ts).
  const kinds = RECONCILE_DECAY_KINDS;
  const result = await database.execute<{ id: number }>(
    sql`UPDATE canonical_topics
        SET status = 'dormant'
        WHERE status = 'active'
          AND ongoing = false
          AND kind = ANY(ARRAY[${sql.join(
            kinds.map((k) => sql`${k}`),
            sql`, `,
          )}]::canonical_topic_kind[])
          AND last_seen < now() - (${RECONCILE_DECAY_DAYS}::int * INTERVAL '1 day')
        RETURNING id`,
  );
  return result.rows.length;
}

/**
 * Maximum rows per `INSERT ... VALUES (...)` statement for the audit log.
 *
 * `reconciliation_log` has 11 bind-positional columns per row at insert time
 * (run_id + 10 audit fields), and Postgres caps a single statement at 65,535
 * bind parameters. 500 rows × 11 cols = 5,500 binds — well under the limit
 * even before integer-array serialization expands the count further. A large
 * reconciliation run touching thousands of clusters would otherwise overflow
 * a single statement and abort the task *after* the merges have already
 * committed, leaving zero audit rows persisted.
 */
const AUDIT_INSERT_BATCH_SIZE = 500;

/**
 * Phase 8 — persist per-cluster audit rows to `reconciliation_log`.
 * All rows for a single run share the same `runId`. The insert is chunked
 * into batches of `AUDIT_INSERT_BATCH_SIZE` so a large run (thousands of
 * clusters) doesn't blow Postgres's bind-parameter limit. No-ops when
 * `audits` is empty so callers don't need to guard.
 *
 * Note: chunks are not transactionally grouped. If a later chunk fails, the
 * earlier chunks remain persisted. This is intentional — partial audit data
 * is more useful than none, and the previous single-statement form already
 * lacked transactional grouping with the merges themselves.
 */
export async function insertReconciliationAuditRows(
  database: DbInserter,
  runId: string,
  audits: ClusterAuditRow[],
): Promise<void> {
  if (audits.length === 0) return;
  for (let i = 0; i < audits.length; i += AUDIT_INSERT_BATCH_SIZE) {
    const batch = audits.slice(i, i + AUDIT_INSERT_BATCH_SIZE);
    await database
      .insert(reconciliationLog)
      .values(batch.map((a) => ({ ...a, runId })));
  }
}
