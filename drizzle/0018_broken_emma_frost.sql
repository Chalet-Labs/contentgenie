ALTER TABLE "episode_topics" ADD COLUMN "topic_rank" integer;--> statement-breakpoint
ALTER TABLE "episode_topics" ADD COLUMN "ranked_at" timestamp;--> statement-breakpoint
CREATE INDEX "episode_topics_topic_rank_idx" ON "episode_topics" USING btree ("topic_rank");--> statement-breakpoint
ALTER TABLE "episode_topics" ADD CONSTRAINT "topic_rank_positive" CHECK ("episode_topics"."topic_rank" IS NULL OR "episode_topics"."topic_rank" >= 1);