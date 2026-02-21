CREATE TABLE "ai_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_enum" CHECK ("ai_config"."provider" IN ('openrouter', 'zai'))
);
--> statement-breakpoint
ALTER TABLE "ai_config" ADD CONSTRAINT "ai_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;