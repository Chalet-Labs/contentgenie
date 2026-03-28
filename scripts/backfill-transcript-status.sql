-- Backfill transcript_status for episodes with NULL status (ADR-026)
--
-- Background: Episodes created before the transcript tracking system have
-- transcript_status = NULL. This script normalizes them:
--   - 47 rows with transcript text  → transcript_status = 'available',
--                                      transcript_source = 'podcastindex'
--   - 156 rows without transcript   → transcript_status = 'missing',
--                                      clear low-quality description-only summaries
--
-- Usage:
--   doppler run --config prd -- psql $DATABASE_URL -f scripts/backfill-transcript-status.sql
--
-- Safety: targets only transcript_status IS NULL rows → idempotent on re-run.

-- ============================================================
-- DRY-RUN: verify counts before committing
-- ============================================================

SELECT
  'with_transcript'    AS category,
  count(*)             AS row_count
FROM episodes
WHERE transcript_status IS NULL
  AND transcript IS NOT NULL
  AND transcript <> ''

UNION ALL

SELECT
  'without_transcript' AS category,
  count(*)             AS row_count
FROM episodes
WHERE transcript_status IS NULL
  AND (transcript IS NULL OR transcript = '')

UNION ALL

SELECT
  'total_null_status'  AS category,
  count(*)             AS row_count
FROM episodes
WHERE transcript_status IS NULL;

-- ============================================================
-- Migration (wrapped in a transaction)
-- ============================================================

BEGIN;

-- 1. Episodes that have transcript text but no status
--    → mark available, infer source as podcastindex (only source before AssemblyAI)
UPDATE episodes
SET
  transcript_status = 'available',
  transcript_source = 'podcastindex',
  updated_at        = now()
WHERE transcript_status IS NULL
  AND transcript IS NOT NULL
  AND transcript <> '';

-- 2. Episodes with no transcript text and no status
--    → mark missing, clear low-quality description-only summary data
UPDATE episodes
SET
  transcript_status  = 'missing',
  summary            = NULL,
  key_takeaways      = NULL,
  worth_it_score     = NULL,
  worth_it_reason    = NULL,
  worth_it_dimensions = NULL,
  processed_at       = NULL,
  updated_at         = now()
WHERE transcript_status IS NULL
  AND (transcript IS NULL OR transcript = '');

-- ============================================================
-- Post-migration verification: should both return 0
-- ============================================================

DO $$
DECLARE
  remaining_null bigint;
BEGIN
  SELECT count(*) INTO remaining_null
  FROM episodes
  WHERE transcript_status IS NULL;

  IF remaining_null <> 0 THEN
    RAISE EXCEPTION
      'Backfill incomplete: % rows still have NULL transcript_status',
      remaining_null;
  END IF;
END $$;

COMMIT;

-- Confirm final counts
SELECT transcript_status, count(*) AS row_count
FROM episodes
GROUP BY transcript_status
ORDER BY row_count DESC;
