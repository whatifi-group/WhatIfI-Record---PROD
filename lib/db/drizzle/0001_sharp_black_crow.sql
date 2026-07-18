CREATE TABLE "onboarding_payroll" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"ni_number" text,
	"bank_name" text,
	"account_holder" text,
	"sort_code" text,
	"account_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_submissions" ALTER COLUMN "start_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_payroll" ADD CONSTRAINT "onboarding_payroll_submission_id_onboarding_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."onboarding_submissions"("id") ON DELETE cascade ON UPDATE no action;