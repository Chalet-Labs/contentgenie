CREATE TABLE "reconciliation_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"cluster_index" integer NOT NULL,
	"cluster_size" integer NOT NULL,
	"winner_id" integer,
	"loser_ids" integer[] NOT NULL,
	"verified_loser_ids" integer[] NOT NULL,
	"rejected_loser_ids" integer[] NOT NULL,
	"merges_executed" integer NOT NULL,
	"merges_rejected" integer NOT NULL,
	"pairwise_verify_threw" integer NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rl_outcome_enum" CHECK ("reconciliation_log"."outcome" IN ('merged', 'partial', 'rejected', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "rl_run_id_idx" ON "reconciliation_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "rl_winner_id_idx" ON "reconciliation_log" USING btree ("winner_id");--> statement-breakpoint
CREATE INDEX "rl_created_at_idx" ON "reconciliation_log" USING btree ("created_at" DESC);