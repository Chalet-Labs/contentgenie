#!/usr/bin/env bun
/**
 * Bootstrap drizzle.__drizzle_migrations to mark pre-existing migrations as applied.
 *
 * **One-time per environment.** Idempotent: re-running is a no-op. See
 * ADR-002 §"2026-05 update" for the full context.
 *
 * Critical: this script ONLY inserts entries whose `tag` is in the frozen
 * `BASELINE_MIGRATION_TAGS` set below — the migrations that existed at the
 * push→migrate cutover. New migrations added after the cutover are NEVER
 * auto-marked applied; they go through `drizzle-kit migrate` normally. Without
 * this guardrail a script run after a new migration was added (with the live
 * journal as the source) would mark the new migration as applied without
 * executing its SQL, producing silent schema drift.
 *
 * Hash format MUST match drizzle-orm's migrator (SHA-256 of the full migration
 * SQL file as read from disk; the migrator splits on `--> statement-breakpoint`
 * but hashes the unsplit string). Source of truth: drizzle-orm's
 * `readMigrationFiles` (migrator.js). Diverging silently breaks
 * `drizzle-kit migrate`'s "already applied" check.
 *
 * Usage (run ONCE per environment, before any new migration is added):
 *   doppler run -- bun scripts/bootstrap-drizzle-migrations.ts
 *   doppler run --config prd -- bun scripts/bootstrap-drizzle-migrations.ts
 */
import { Pool } from "@neondatabase/serverless";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type JournalEntry = { tag: string; when: number };
type Journal = { entries: JournalEntry[] };

// Frozen at the push→migrate cutover (PR for #456). Do NOT add new tags here —
// they belong in regular migration deploys via `drizzle-kit migrate`.
const BASELINE_MIGRATION_TAGS: ReadonlySet<string> = new Set([
  "0000_fine_cardiac",
  "0001_pink_roland_deschain",
  "0002_perpetual_terror",
  "0003_mixed_morg",
  "0004_cheerful_exiles",
  "0005_sleepy_siren",
  "0006_adorable_bloodstrike",
  "0007_dapper_skaar",
  "0008_clean_thundra",
  "0009_ordinary_warbird",
  "0010_polite_shocker",
  "0011_futuristic_wildside",
  "0012_messy_expediter",
  "0013_burly_rhino",
  "0014_cuddly_squadron_supreme",
  "0015_low_firebrand",
  "0016_abnormal_wendell_vaughn",
  "0017_rich_iron_monger",
  "0018_broken_emma_frost",
  "0019_lumpy_overlord",
  "0020_wooden_darkstar",
  "0021_polite_cannonball",
  "0022_brainy_blink",
  "0023_enable_pgvector",
  "0024_vengeful_salo",
  "0025_loose_matthew_murdock",
  "0026_breezy_gabe_jones",
  "0027_open_silhouette",
  "0028_abandoned_bloodscream",
  "0029_parallel_prodigy",
  "0030_mute_shooting_star",
  "0031_fat_thaddeus_ross",
  "0032_superb_bullseye",
]);

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "drizzle");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
const TRACKING_SCHEMA = "drizzle";
const TRACKING_TABLE = "__drizzle_migrations";
const TRACKING_REF = `"${TRACKING_SCHEMA}"."${TRACKING_TABLE}"`;

function readJournal(): Journal {
  const parsed: unknown = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    throw new Error(
      `Journal at ${JOURNAL_PATH} is malformed (missing or non-array 'entries').`,
    );
  }
  return parsed as Journal;
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
  const baselineEntries = journal.entries
    .filter((entry) => BASELINE_MIGRATION_TAGS.has(entry.tag))
    .map((entry) => ({
      tag: entry.tag,
      when: entry.when,
      hash: hashMigration(entry.tag),
    }));

  if (baselineEntries.length !== BASELINE_MIGRATION_TAGS.size) {
    const journalTags = new Set(journal.entries.map((e) => e.tag));
    const missing = Array.from(BASELINE_MIGRATION_TAGS).filter(
      (tag) => !journalTags.has(tag),
    );
    throw new Error(
      `Journal is missing ${missing.length} baseline tag(s): ${missing.join(", ")}. ` +
        `Refusing to bootstrap with an inconsistent journal.`,
    );
  }

  const newTagsInJournal = journal.entries.filter(
    (entry) => !BASELINE_MIGRATION_TAGS.has(entry.tag),
  );
  if (newTagsInJournal.length > 0) {
    console.log(
      `Note: journal has ${newTagsInJournal.length} non-baseline migration(s) (${newTagsInJournal
        .map((e) => e.tag)
        .join(
          ", ",
        )}); these will NOT be marked applied here — they apply via 'drizzle-kit migrate'.`,
    );
  }

  console.log(
    `Baseline: ${baselineEntries.length} migrations to ensure tracked`,
  );

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${TRACKING_SCHEMA}"`);
    // `numeric` is wider than drizzle-orm's `bigint` (pg-core/dialect.js); both
    // deserialize via Number() in drizzle's lastDbMigration check, so values are
    // interchangeable. CREATE TABLE IF NOT EXISTS means whichever runs first
    // wins — we tolerate either column type to avoid an irreversible ALTER.
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${TRACKING_REF} (
        "id" SERIAL PRIMARY KEY,
        "hash" text NOT NULL,
        "created_at" numeric
      )`,
    );

    // Single-round-trip insert: unnest the parallel arrays into rows, then
    // anti-join against the existing table to skip already-tracked hashes.
    // Avoids N sequential RTTs without adding a unique index drizzle-orm
    // itself doesn't create on this table.
    const result = await pool.query<{ tag: string; hash: string }>(
      `WITH input AS (
         SELECT t.tag, t.hash, t.created_at
         FROM unnest($1::text[], $2::text[], $3::numeric[]) AS t(tag, hash, created_at)
       ),
       inserted AS (
         INSERT INTO ${TRACKING_REF} ("hash", "created_at")
         SELECT input.hash, input.created_at
         FROM input
         WHERE NOT EXISTS (
           SELECT 1 FROM ${TRACKING_REF} m WHERE m.hash = input.hash
         )
         RETURNING hash
       )
       SELECT input.tag, input.hash
       FROM input
       JOIN inserted USING (hash)
       ORDER BY input.tag`,
      [
        baselineEntries.map((e) => e.tag),
        baselineEntries.map((e) => e.hash),
        baselineEntries.map((e) => e.when),
      ],
    );

    for (const row of result.rows) {
      console.log(`  + ${row.tag} (hash ${row.hash.slice(0, 12)}…)`);
    }
    const inserted = result.rows.length;
    const alreadyApplied = baselineEntries.length - inserted;

    const baselineHashes = baselineEntries.map((e) => e.hash);
    const matchResult = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${TRACKING_REF} WHERE "hash" = ANY($1::text[])`,
      [baselineHashes],
    );
    const baselineMatched = Number(matchResult.rows[0]?.count ?? "0");

    console.log(
      `Done: inserted ${inserted}, already-applied ${alreadyApplied}, baseline rows in DB ${baselineMatched}/${baselineEntries.length}`,
    );

    if (baselineMatched !== baselineEntries.length) {
      throw new Error(
        `Baseline coverage incomplete: ${baselineMatched}/${baselineEntries.length} hashes present.`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const message =
    err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error("Bootstrap failed:", message);
  process.exit(1);
});
