DROP INDEX "rl_created_at_idx";--> statement-breakpoint
CREATE INDEX "rl_created_at_idx" ON "reconciliation_log" USING btree (("created_at" AT TIME ZONE 'UTC') DESC);