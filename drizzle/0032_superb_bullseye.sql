-- Issue #451: Postgres truncates auto-generated drizzle FK names ≥64 chars to
-- 63 chars (silent identifier truncation). Three FK constraints landed with
-- truncated names; drizzle-kit's diff doesn't model truncation and re-emits
-- the same DROP+ADD on every `drizzle-kit push` (non-convergent).
--
-- Renaming in place avoids FK revalidation cost (vs DROP + ADD on populated
-- tables). The FROM-side names below are the actual truncated 63-char names
-- that exist in the database; their pre-truncation forms (as written by
-- migrations 0024 and 0026) were 65–66 chars.
ALTER TABLE "canonical_topic_aliases"
  RENAME CONSTRAINT "canonical_topic_aliases_canonical_topic_id_canonical_topics_id_"
  TO "cta_canonical_topic_id_fk";
--> statement-breakpoint
ALTER TABLE "canonical_topic_digests"
  RENAME CONSTRAINT "canonical_topic_digests_canonical_topic_id_canonical_topics_id_"
  TO "ctd_canonical_topic_id_fk";
--> statement-breakpoint
ALTER TABLE "episode_canonical_topics"
  RENAME CONSTRAINT "episode_canonical_topics_canonical_topic_id_canonical_topics_id"
  TO "ect_canonical_topic_id_fk";
