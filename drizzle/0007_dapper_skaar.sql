ALTER TABLE "episodes" ADD COLUMN "worth_it_dimensions" json;--> statement-breakpoint
CREATE INDEX "user_library_episode_id_idx" ON "user_library" USING btree ("episode_id");