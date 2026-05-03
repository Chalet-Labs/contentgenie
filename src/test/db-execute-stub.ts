import type { db as RealDb } from "@/db";

export type DbExecuteCall = (sqlObj: unknown) => Promise<{ rows: unknown[] }>;

export interface DbExecuteStub {
  /** Cast Drizzle-shaped wrapper so callers can pass it directly as `database` to helper functions. */
  db: typeof RealDb;
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
  return {
    db: { execute } as unknown as typeof RealDb,
    execute,
    calls,
    remaining: () => queue.length,
  };
}
