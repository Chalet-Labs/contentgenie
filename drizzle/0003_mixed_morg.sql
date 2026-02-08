ALTER TABLE "episodes" ADD COLUMN "summary_run_id" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "summary_status" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "rss_guid" text;--> statement-breakpoint
ALTER TABLE "podcasts" ADD COLUMN "source" text DEFAULT 'podcastindex' NOT NULL;--> statement-breakpoint
CREATE INDEX "episodes_rss_guid_idx" ON "episodes" USING btree ("rss_guid");--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "summary_status_enum" CHECK ("episodes"."summary_status" IN ('queued', 'running', 'completed', 'failed'));