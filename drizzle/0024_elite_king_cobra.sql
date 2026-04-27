CREATE TYPE "public"."canonical_topic_kind" AS ENUM('release', 'incident', 'regulation', 'announcement', 'deal', 'event', 'concept', 'work', 'other');--> statement-breakpoint
CREATE TYPE "public"."canonical_topic_status" AS ENUM('active', 'merged', 'dormant');--> statement-breakpoint
CREATE TABLE "canonical_topic_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_topic_id" integer NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"kind" "canonical_topic_kind" NOT NULL,
	"status" "canonical_topic_status" DEFAULT 'active' NOT NULL,
	"summary" text NOT NULL,
	"ongoing" boolean DEFAULT false NOT NULL,
	"relevance" real NOT NULL,
	"episode_count" integer DEFAULT 0 NOT NULL,
	"identity_embedding" vector(1024) NOT NULL,
	"context_embedding" vector(1024) NOT NULL,
	"embedding_model_version" varchar DEFAULT 'pplx-embed-v1-0.6b' NOT NULL,
	"merged_into_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ct_merged_biconditional" CHECK (("canonical_topics"."status" = 'merged' AND "canonical_topics"."merged_into_id" IS NOT NULL) OR ("canonical_topics"."status" <> 'merged' AND "canonical_topics"."merged_into_id" IS NULL)),
	CONSTRAINT "ct_no_self_merge" CHECK ("canonical_topics"."merged_into_id" <> "canonical_topics"."id"),
	CONSTRAINT "ct_relevance_range" CHECK ("canonical_topics"."relevance" >= 0 AND "canonical_topics"."relevance" <= 1),
	CONSTRAINT "ct_episode_count_gte_0" CHECK ("canonical_topics"."episode_count" >= 0),
	CONSTRAINT "ct_label_not_blank" CHECK (length(btrim("canonical_topics"."label")) > 0),
	CONSTRAINT "ct_summary_not_blank" CHECK (length(btrim("canonical_topics"."summary")) > 0)
);
--> statement-breakpoint
CREATE TABLE "episode_canonical_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"canonical_topic_id" integer NOT NULL,
	"match_method" text NOT NULL,
	"similarity_to_top_match" real,
	"coverage_score" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ect_match_method_enum" CHECK ("episode_canonical_topics"."match_method" IN ('auto', 'llm_disambig', 'new')),
	CONSTRAINT "ect_coverage_score_range" CHECK ("episode_canonical_topics"."coverage_score" >= 0 AND "episode_canonical_topics"."coverage_score" <= 1),
	CONSTRAINT "ect_similarity_range" CHECK ("episode_canonical_topics"."similarity_to_top_match" IS NULL OR ("episode_canonical_topics"."similarity_to_top_match" >= 0 AND "episode_canonical_topics"."similarity_to_top_match" <= 1))
);
--> statement-breakpoint
ALTER TABLE "canonical_topic_aliases" ADD CONSTRAINT "canonical_topic_aliases_canonical_topic_id_canonical_topics_id_fk" FOREIGN KEY ("canonical_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_topics" ADD CONSTRAINT "canonical_topics_merged_into_id_canonical_topics_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."canonical_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_canonical_topics" ADD CONSTRAINT "episode_canonical_topics_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_canonical_topics" ADD CONSTRAINT "episode_canonical_topics_canonical_topic_id_canonical_topics_id_fk" FOREIGN KEY ("canonical_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cta_topic_alias_lower_uidx" ON "canonical_topic_aliases" USING btree ("canonical_topic_id",lower("alias"));--> statement-breakpoint
CREATE INDEX "ct_identity_embedding_hnsw_idx" ON "canonical_topics" USING hnsw ("identity_embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "ct_context_embedding_hnsw_idx" ON "canonical_topics" USING hnsw ("context_embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE UNIQUE INDEX "ct_normalized_label_kind_active_uidx" ON "canonical_topics" USING btree (lower("normalized_label"),"kind") WHERE "canonical_topics"."status" = 'active';--> statement-breakpoint
CREATE INDEX "ct_merged_into_id_idx" ON "canonical_topics" USING btree ("merged_into_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ect_episode_canonical_uidx" ON "episode_canonical_topics" USING btree ("episode_id","canonical_topic_id");--> statement-breakpoint
CREATE INDEX "ect_canonical_id_idx" ON "episode_canonical_topics" USING btree ("canonical_topic_id");