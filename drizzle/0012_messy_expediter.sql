ALTER TABLE "episodes" ADD COLUMN "transcript_source" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "transcript_status" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "transcript_fetched_at" timestamp;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "transcript_error" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "transcript_source_enum" CHECK ("episodes"."transcript_source" IN ('podcastindex', 'assemblyai', 'description-url'));--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "transcript_status_enum" CHECK ("episodes"."transcript_status" IN ('missing', 'fetching', 'available', 'failed'));
--> statement-breakpoint
-- Backfill: episodes with transcription text → available
UPDATE "episodes"
SET "transcript_status" = 'available',
    "transcript_fetched_at" = "processed_at"
WHERE "transcription" IS NOT NULL;
--> statement-breakpoint
-- Backfill: episodes summarized without transcript → missing
UPDATE "episodes"
SET "transcript_status" = 'missing'
WHERE "transcription" IS NULL
  AND "processed_at" IS NOT NULL;