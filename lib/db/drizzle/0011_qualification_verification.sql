-- Add verification columns to employee_qualifications
ALTER TABLE "employee_qualifications"
  ADD COLUMN "verification_status" text NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "employee_qualifications"
  ADD COLUMN "verification_notes" text;
--> statement-breakpoint
ALTER TABLE "employee_qualifications"
  ADD COLUMN "verified_by" integer;
--> statement-breakpoint
ALTER TABLE "employee_qualifications"
  ADD COLUMN "verified_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "employee_qualifications"
  ADD CONSTRAINT "employee_qualifications_verified_by_fk"
  FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;
