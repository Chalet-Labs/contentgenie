CREATE TABLE "listen_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"episode_id" integer NOT NULL,
	"podcast_index_episode_id" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"listen_duration_seconds" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"expire" bigint
);
--> statement-breakpoint
ALTER TABLE "listen_history" ADD CONSTRAINT "listen_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listen_history" ADD CONSTRAINT "listen_history_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listen_history_user_episode_idx" ON "listen_history" USING btree ("user_id","episode_id");--> statement-breakpoint
CREATE INDEX "listen_history_user_id_idx" ON "listen_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listen_history_podcast_index_episode_id_idx" ON "listen_history" USING btree ("podcast_index_episode_id");