-- Employee disclosure tables: DBS, PVG, and AccessNI checks
-- with Update Service log and conviction sign-off workflow.

CREATE TABLE IF NOT EXISTS "employee_disclosures" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL,
  "check_type" text NOT NULL,
  "check_level" text NOT NULL,
  "certificate_number" text,
  "issue_date" date NOT NULL,
  "on_update_service" boolean NOT NULL DEFAULT false,
  "conviction_details" text,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "employee_disclosures_check_type_check" CHECK ("check_type" IN ('dbs', 'pvg', 'access_ni')),
  CONSTRAINT "employee_disclosures_check_level_check" CHECK ("check_level" IN ('basic', 'standard', 'enhanced', 'enhanced_barred'))
);
--> statement-breakpoint
ALTER TABLE "employee_disclosures" ADD CONSTRAINT "employee_disclosures_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "employee_disclosure_update_checks" (
  "id" serial PRIMARY KEY NOT NULL,
  "disclosure_id" integer NOT NULL,
  "checked_date" date NOT NULL,
  "result" text NOT NULL,
  "checked_by" text NOT NULL,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "employee_disclosure_update_checks_result_check" CHECK ("result" IN ('clear', 'not_clear', 'changes_shown'))
);
--> statement-breakpoint
ALTER TABLE "employee_disclosure_update_checks" ADD CONSTRAINT "employee_disclosure_update_checks_disclosure_id_fk" FOREIGN KEY ("disclosure_id") REFERENCES "public"."employee_disclosures"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "employee_disclosure_reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "disclosure_id" integer NOT NULL,
  "recommendation" text NOT NULL,
  "reviewer_notes" text,
  "review_date" date NOT NULL,
  "signed_off_by_user_id" integer,
  "signed_off_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "employee_disclosure_reviews_recommendation_check" CHECK ("recommendation" IN ('approved', 'not_approved', 'further_review')),
  CONSTRAINT "employee_disclosure_reviews_disclosure_id_unique" UNIQUE("disclosure_id")
);
--> statement-breakpoint
ALTER TABLE "employee_disclosure_reviews" ADD CONSTRAINT "employee_disclosure_reviews_disclosure_id_fk" FOREIGN KEY ("disclosure_id") REFERENCES "public"."employee_disclosures"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_disclosure_reviews" ADD CONSTRAINT "employee_disclosure_reviews_signed_off_by_user_id_fk" FOREIGN KEY ("signed_off_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
