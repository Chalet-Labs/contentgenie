CREATE TABLE "trending_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"topics" json NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"episode_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "trending_topics_generated_at_idx" ON "trending_topics" USING btree ("generated_at");