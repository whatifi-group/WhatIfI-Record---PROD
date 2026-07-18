CREATE TABLE "notification_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"recipients" text,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_key_unique" UNIQUE("key")
);
