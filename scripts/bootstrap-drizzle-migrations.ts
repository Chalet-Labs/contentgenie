#!/usr/bin/env bun
/**
 * Bootstrap drizzle.__drizzle_migrations to mark pre-existing migrations as applied.
 *
 * Issue #456: switching prod and preview from `drizzle-kit push` to `drizzle-kit migrate`.
 * Push manages schema state by diffing without recording which migration files were applied.
 * Migrate requires a tracking table; this script populates it for environments that already
 * have the schema state applied via push.
 *
 * Idempotent: safe to re-run. Inserts rows only when their hash is not already present.
 *
 * Hash format MUST match drizzle-orm's migrator: SHA-256 of full migration SQL file contents.
 * See node_modules/drizzle-orm/migrator.js (readMigrationFiles) and
 * node_modules/drizzle-orm/pg-core/dialect.js (migrate).
 *
 * Usage:
 *   doppler run -- bun scripts/bootstrap-drizzle-migrations.ts
 *   doppler run --config prd -- bun scripts/bootstrap-drizzle-migrations.ts
 */
import { Pool } from "@neondatabase/serverless";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "drizzle");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

function readJournal(): Journal {
  if (!fs.existsSync(JOURNAL_PATH)) {
    throw new Error(`Journal not found at ${JOURNAL_PATH}`);
  }
  return JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as Journal;
}

function hashMigration(tag: string): string {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  return crypto.createHash("sha256").update(sql).digest("hex");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL not set. Wrap with `doppler run --` to inject secrets.",
    );
  }

  const journal = readJournal();
  const entries = journal.entries.map((entry) => ({
    tag: entry.tag,
    when: entry.when,
    hash: hashMigration(entry.tag),
  }));

  console.log(`Journal: ${entries.length} migrations to ensure tracked`);

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await pool.query(
      `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        "id" SERIAL PRIMARY KEY,
        "hash" text NOT NULL,
        "created_at" numeric
      )`,
    );

    let inserted = 0;
    let alreadyApplied = 0;

    for (const entry of entries) {
      const result = await pool.query(
        `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
         SELECT $1::text, $2::numeric
         WHERE NOT EXISTS (
           SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "hash" = $1::text
         )`,
        [entry.hash, entry.when],
      );
      if (result.rowCount && result.rowCount > 0) {
        inserted += 1;
        console.log(`  + ${entry.tag} (hash ${entry.hash.slice(0, 12)}…)`);
      } else {
        alreadyApplied += 1;
      }
    }

    const countResult = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "drizzle"."__drizzle_migrations"`,
    );
    const finalCount = Number(countResult.rows[0]?.count ?? "0");

    console.log(
      `Done: inserted ${inserted}, already-applied ${alreadyApplied}, final row count ${finalCount}`,
    );

    if (finalCount < entries.length) {
      throw new Error(
        `Final row count (${finalCount}) is below journal length (${entries.length}). Bootstrap incomplete.`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
