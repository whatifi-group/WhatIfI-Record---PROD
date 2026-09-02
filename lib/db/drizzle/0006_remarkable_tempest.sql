ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ms_entra_object_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ms_entra_object_id_unique" UNIQUE("ms_entra_object_id");