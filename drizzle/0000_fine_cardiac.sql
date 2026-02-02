CREATE TABLE "bookmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_library_id" integer NOT NULL,
	"timestamp" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"podcast_id" integer NOT NULL,
	"podcast_index_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"audio_url" text,
	"duration" integer,
	"publish_date" timestamp,
	"transcription" text,
	"summary" text,
	"key_takeaways" json,
	"worth_it_score" numeric(3, 2),
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "episodes_podcast_index_id_unique" UNIQUE("podcast_index_id")
);
--> statement-breakpoint
CREATE TABLE "podcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"podcast_index_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"publisher" text,
	"image_url" text,
	"rss_feed_url" text,
	"categories" json,
	"total_episodes" integer,
	"latest_episode_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "podcasts_podcast_index_id_unique" UNIQUE("podcast_index_id")
);
--> statement-breakpoint
CREATE TABLE "user_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"episode_id" integer NOT NULL,
	"saved_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"rating" integer,
	"collection_id" integer
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"podcast_id" integer NOT NULL,
	"subscribed_at" timestamp DEFAULT now() NOT NULL,
	"notifications_enabled" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"preferences" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_library_id_user_library_id_fk" FOREIGN KEY ("user_library_id") REFERENCES "public"."user_library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_library" ADD CONSTRAINT "user_library_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_library" ADD CONSTRAINT "user_library_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_library" ADD CONSTRAINT "user_library_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmarks_user_library_id_idx" ON "bookmarks" USING btree ("user_library_id");--> statement-breakpoint
CREATE INDEX "collections_user_id_idx" ON "collections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_podcast_index_id_idx" ON "episodes" USING btree ("podcast_index_id");--> statement-breakpoint
CREATE INDEX "episodes_podcast_id_idx" ON "episodes" USING btree ("podcast_id");--> statement-breakpoint
CREATE UNIQUE INDEX "podcasts_podcast_index_id_idx" ON "podcasts" USING btree ("podcast_index_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_library_user_episode_idx" ON "user_library" USING btree ("user_id","episode_id");--> statement-breakpoint
CREATE INDEX "user_library_user_id_idx" ON "user_library" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_library_collection_id_idx" ON "user_library" USING btree ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_subscriptions_user_podcast_idx" ON "user_subscriptions" USING btree ("user_id","podcast_id");--> statement-breakpoint
CREATE INDEX "user_subscriptions_user_id_idx" ON "user_subscriptions" USING btree ("user_id");