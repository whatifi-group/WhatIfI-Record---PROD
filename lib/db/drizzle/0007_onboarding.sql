-- Add onboarding_submissions and onboarding_submission_qualifications tables
-- for the self-service employee onboarding flow.

CREATE TABLE IF NOT EXISTS "onboarding_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"job_title" text NOT NULL,
	"department_id" integer,
	"employment_type" text NOT NULL,
	"start_date" date NOT NULL,
	"onboarding_status" text DEFAULT 'pending' NOT NULL,
	"employee_id" integer,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" integer,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_submission_qualifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"qualification_type_id" integer NOT NULL,
	"date_achieved" date NOT NULL,
	"expiry_date" date,
	"notes" text,
	"file_name" text,
	"file_url" text,
	"mime_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_submission_qualifications" ADD CONSTRAINT "onboarding_submission_qualifications_submission_id_onboarding_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."onboarding_submissions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_submission_qualifications" ADD CONSTRAINT "onboarding_submission_qualifications_qualification_type_id_qualification_types_id_fk" FOREIGN KEY ("qualification_type_id") REFERENCES "public"."qualification_types"("id") ON DELETE restrict ON UPDATE no action;
