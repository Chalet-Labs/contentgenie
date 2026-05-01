-- Backfill episode_canonical_topics.updated_at for rows that pre-date the
-- 0029_parallel_prodigy migration (ADR-047, PR #418).
--
-- Background: migration 0029 added `updated_at timestamp NOT NULL DEFAULT now()`
-- to the junction. Because this project uses `drizzle-kit push` (not `migrate`),
-- the migration file's nullable-then-backfill sequence is flattened into a
-- single ALTER TABLE — every pre-existing row reads `updated_at = ALTER TABLE
-- timestamp`. The dashboard at /admin/topics/observability filters rolling
-- windows on `updated_at` (`src/lib/observability/resolution-metrics.ts`),
-- which would silently inflate 24h/7d/30d counts with historical rows for
-- up to 30 days post-deploy.
--
-- This script normalizes legacy rows by copying `created_at` into `updated_at`,
-- so only true re-resolutions (which advance `updated_at` via ON CONFLICT
-- DO UPDATE in `insertJunction`) appear as recent observations.
--
-- Usage (after `bun run db:push` lands the column on prod):
--   doppler run --config prd -- psql $DATABASE_URL -f scripts/backfill-junction-updated-at.sql
--
-- ⚠️  Operational requirement: run with the resolver paused
--
-- Because `db:push` adds the column with `DEFAULT now() NOT NULL` in one shot,
-- *every* legacy row reads `updated_at = ALTER TABLE timestamp` after the push.
-- A real ON CONFLICT re-resolution that landed between the push and this
-- backfill would also have a recent `updated_at > created_at` — so this
-- script cannot distinguish "migration default" from "legitimate re-resolution"
-- by timestamp alone.
--
-- Safe ops procedure:
--   1. Pause `resolveAndPersistEpisodeTopics` (Trigger.dev) so no new
--      ON CONFLICT updates touch the junction.
--   2. `bun run db:push` (adds the column).
--   3. Run this backfill (resets all `updated_at > created_at` to `created_at`).
--   4. Resume the resolver.
--
-- Under steps 1–3, no real re-resolutions happen in the window, so the flat
-- `WHERE updated_at > created_at` filter touches only legacy rows.

-- ============================================================
-- DRY-RUN: count rows that will be touched (no WHERE clause so each
-- conditional aggregate runs against the full table)
-- ============================================================

SELECT
  count(*) FILTER (WHERE updated_at > created_at) AS rows_to_backfill,
  count(*) FILTER (WHERE updated_at = created_at) AS rows_already_aligned,
  count(*)                                          AS total_rows
FROM episode_canonical_topics;

-- ============================================================
-- Backfill (wrapped in a transaction)
-- ============================================================

BEGIN;

UPDATE episode_canonical_topics
SET updated_at = created_at
WHERE updated_at > created_at;

-- ============================================================
-- Post-backfill verification: every row should have updated_at = created_at
-- (the resolver is paused, so no row should have advanced after creation)
-- ============================================================

DO $$
DECLARE
  drift_rows bigint;
BEGIN
  SELECT count(*) INTO drift_rows
  FROM episode_canonical_topics
  WHERE updated_at > created_at;

  IF drift_rows <> 0 THEN
    RAISE EXCEPTION
      'Backfill incomplete: % rows still have updated_at > created_at — resolver may not be paused',
      drift_rows;
  END IF;
END $$;

COMMIT;

-- Confirm the bulk of rows now have updated_at = created_at
SELECT
  count(*) FILTER (WHERE updated_at = created_at) AS rows_at_created_at,
  count(*) FILTER (WHERE updated_at > created_at) AS rows_re_resolved,
  count(*)                                          AS total_rows
FROM episode_canonical_topics;
