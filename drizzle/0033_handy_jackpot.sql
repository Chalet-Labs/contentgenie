ALTER TABLE "episodes" DROP CONSTRAINT "transcript_source_enum";--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "episode_link" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "transcript_extractor" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "transcript_source_enum" CHECK ("episodes"."transcript_source" IN ('podcastindex', 'assemblyai', 'description-url', 'podcast-site'));