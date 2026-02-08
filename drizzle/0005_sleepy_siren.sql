ALTER TABLE "episodes" DROP CONSTRAINT "summary_status_enum";--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "processing_error" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "summary_status_enum" CHECK ("episodes"."summary_status" IN ('queued', 'running', 'transcribing', 'summarizing', 'completed', 'failed'));