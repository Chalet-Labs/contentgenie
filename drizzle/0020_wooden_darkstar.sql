CREATE TABLE "user_player_session" (
	"user_id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"title" text NOT NULL,
	"podcast_title" text NOT NULL,
	"audio_url" text NOT NULL,
	"artwork" text,
	"duration" integer,
	"chapters_url" text,
	"current_time" numeric(12, 3) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_queue_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"episode_id" text NOT NULL,
	"title" text NOT NULL,
	"podcast_title" text NOT NULL,
	"audio_url" text NOT NULL,
	"artwork" text,
	"duration" integer,
	"chapters_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_player_session" ADD CONSTRAINT "user_player_session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_queue_items" ADD CONSTRAINT "user_queue_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_queue_items_user_episode_idx" ON "user_queue_items" USING btree ("user_id","episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_queue_items_user_position_idx" ON "user_queue_items" USING btree ("user_id","position");