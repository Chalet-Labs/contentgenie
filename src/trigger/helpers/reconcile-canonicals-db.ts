/**
 * Repository-style SQL helpers for the nightly canonical-topic reconciliation
 * pipeline. Helpers accept a minimal `DbExecutor` (just `execute`) so fakes
 * type-check without `as unknown as` casts and the helpers don't depend on
 * the full Drizzle client surface or the orchestrator's `ReconcileDeps` bag.
 */

import { sql } from "drizzle-orm";

import type { db as RealDb } from "@/db";
import { coerceEmbedding } from "@/trigger/helpers/coerce-embedding";
import {
  RECONCILE_DECAY_DAYS,
  RECONCILE_DECAY_KINDS,
  RECONCILE_LOOKBACK_DAYS,
} from "@/lib/reconcile-constants";
import type { ReconcileMember } from "@/lib/prompts/reconcile-winner-pick";

export type DbExecutor = Pick<typeof RealDb, "execute">;

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
