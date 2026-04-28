CREATE TABLE "canonical_topic_digests" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_topic_id" integer NOT NULL,
	"digest_markdown" text NOT NULL,
	"consensus_points" jsonb NOT NULL,
	"disagreement_points" jsonb NOT NULL,
	"episode_ids" integer[] NOT NULL,
	"episode_count_at_generation" integer NOT NULL,
	"model_used" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ctd_episode_count_gte_0" CHECK ("canonical_topic_digests"."episode_count_at_generation" >= 0)
);
--> statement-breakpoint
ALTER TABLE "canonical_topic_digests" ADD CONSTRAINT "canonical_topic_digests_canonical_topic_id_canonical_topics_id_fk" FOREIGN KEY ("canonical_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ctd_canonical_topic_uidx" ON "canonical_topic_digests" USING btree ("canonical_topic_id");