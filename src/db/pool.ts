import "server-only";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "@/db/schema";

// Trigger.dev's worker runtime has no global `WebSocket`, so the Neon Pool
// driver throws "All attempts to open a WebSocket … failed" on every
// transaction. Guard avoids overriding a native WebSocket in environments
// that already have one (e.g., Vercel Node 22+).
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

/**
 * Pool-backed Drizzle client + `transactional()` helper.
 *
 * Coexists with the HTTP client at `src/db/index.ts`: the HTTP driver does
 * not support `db.transaction()`, but the entity-resolution pipeline needs
 * `pg_advisory_xact_lock`-guarded transactions. ADR-044 covers the rationale.
 *
 * Lazy singleton — Pool is constructed at first call, not at module load,
 * so test environments without `DATABASE_URL` don't fail to import.
 */

let _pool: Pool | undefined;
let _db: NeonDatabase<typeof schema> | undefined;

function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL environment variable is not set. Run `doppler setup` " +
          "and use the doppler-wrapped scripts in package.json (e.g. `bun run dev`).",
      );
    }
    _pool = new Pool({ connectionString });
  }
  return _pool;
}

export function getDbPool(): NeonDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

/**
 * Run `fn` inside a Postgres transaction. Commits on resolve; rolls back
 * and re-throws on reject. Used by the entity resolver to scope an
 * advisory lock + read + write to a single connection.
 *
 * When `options.tx` is supplied the caller's transaction is reused directly
 * (no nested BEGIN), which lets helpers be composed into an outer transaction
 * by orchestrating callers (e.g. the B1 reconciliation task).
 */
export function transactional<T>(
  fn: (tx: NeonDatabase<typeof schema>) => Promise<T>,
  options?: { tx?: NeonDatabase<typeof schema> },
): Promise<T> {
  if (options?.tx) return fn(options.tx);
  return getDbPool().transaction((tx) => fn(tx));
}
