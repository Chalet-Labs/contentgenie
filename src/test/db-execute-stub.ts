import type { DbExecutor } from "@/trigger/helpers/reconcile-canonicals-db";

export type DbExecuteCall = (sqlObj: unknown) => Promise<{ rows: unknown[] }>;

export interface DbExecuteStub {
  /** Minimal Drizzle-shaped wrapper — `DbExecutor` exposes only `execute`, so callers pass it directly to helpers without unsafe casts. */
  db: DbExecutor;
  /** Bare `execute` callable — useful when the consumer wires it into a richer dep bag (e.g. `ReconcileDeps`). */
  execute: DbExecuteCall;
  /** Drizzle SQL objects captured in call order; pass to `serializeSql` for shape assertions. */
  calls: unknown[];
  /** Remaining payloads in the queue — useful for asserting full consumption. */
  remaining: () => number;
}

/**
 * Build a queue-driven `db.execute` stub. The queue holds `{ rows }` payloads;
 * each `execute` call pops one. Throws if the consumer calls more times than
 * payloads were provided so missing fixtures surface immediately instead of
 * resolving to undefined.
 */
export function makeDbExecuteStub(
  payloads: Array<{ rows: unknown[] }>,
): DbExecuteStub {
  const queue = [...payloads];
  const calls: unknown[] = [];
  const execute: DbExecuteCall = (sqlObj) => {
    calls.push(sqlObj);
    const next = queue.shift();
    if (!next) {
      throw new Error(
        `db.execute called more times than payloads provided (call #${calls.length})`,
      );
    }
    return Promise.resolve(next);
  };
  // Drizzle's `execute` is a generic returning `PgRaw<NeonHttpQueryResult<TRow>>`
  // — a richer surface than tests need. Casting through `unknown` is unavoidable
  // at the seam between the simple stub callable and the full driver type, but
  // narrowing the target to `DbExecutor` (= `Pick<typeof RealDb, "execute">`)
  // keeps the cast scoped to the smallest possible surface.
  return {
    db: { execute } as unknown as DbExecutor,
    execute,
    calls,
    remaining: () => queue.length,
  };
}
