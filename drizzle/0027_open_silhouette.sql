CREATE TABLE "canonical_topic_admin_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"loser_id" integer NOT NULL,
	"winner_id" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ctal_action_enum" CHECK ("canonical_topic_admin_log"."action" IN ('merge', 'unmerge'))
);
--> statement-breakpoint
CREATE INDEX "ctal_loser_id_idx" ON "canonical_topic_admin_log" USING btree ("loser_id");--> statement-breakpoint
CREATE INDEX "ctal_winner_id_idx" ON "canonical_topic_admin_log" USING btree ("winner_id");--> statement-breakpoint
CREATE INDEX "ctal_created_at_idx" ON "canonical_topic_admin_log" USING btree ("created_at" DESC);