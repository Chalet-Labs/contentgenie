CREATE TABLE "episode_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"topic" text NOT NULL,
	"relevance" numeric(3, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relevance_range" CHECK ("episode_topics"."relevance" >= 0 AND "episode_topics"."relevance" <= 1)
);
--> statement-breakpoint
ALTER TABLE "episode_topics" ADD CONSTRAINT "episode_topics_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_topics_episode_topic_idx" ON "episode_topics" USING btree ("episode_id","topic");--> statement-breakpoint
CREATE INDEX "episode_topics_topic_idx" ON "episode_topics" USING btree ("topic");