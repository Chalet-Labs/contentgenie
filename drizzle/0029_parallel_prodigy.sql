ALTER TABLE "episode_canonical_topics" ADD COLUMN "version_token_forced_disambig" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill `updated_at` from `created_at` for legacy rows so rolling-window
-- dashboard queries don't count every pre-migration row as "just observed".
-- Pattern matches ADR-026: nullable add → backfill → set default → set NOT NULL.
-- `db:push` (used in this project, not `migrate`) flattens this to a single
-- ALTER TABLE — the prod backfill is run separately via
-- scripts/backfill-junction-updated-at.sql before the dashboard goes live.
ALTER TABLE "episode_canonical_topics" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
UPDATE "episode_canonical_topics" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "episode_canonical_topics" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "episode_canonical_topics" ALTER COLUMN "updated_at" SET NOT NULL;