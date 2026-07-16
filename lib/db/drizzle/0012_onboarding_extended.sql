-- Make job_title and employment_type optional in onboarding_submissions
-- (these are now set by HR at approval time, not collected from candidates)
ALTER TABLE "onboarding_submissions" ALTER COLUMN "job_title" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "onboarding_submissions" ALTER COLUMN "employment_type" DROP NOT NULL;
--> statement-breakpoint

-- ── Onboarding staging: address ────────────────────────────────────────────
CREATE TABLE "onboarding_addresses" (
  "id" serial PRIMARY KEY NOT NULL,
  "submission_id" integer NOT NULL,
  "line1" text,
  "line2" text,
  "city" text,
  "county" text,
  "postcode" text,
  "country" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_addresses"
  ADD CONSTRAINT "onboarding_addresses_submission_id_fk"
  FOREIGN KEY ("submission_id") REFERENCES "onboarding_submissions"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- ── Onboarding staging: next of kin ────────────────────────────────────────
CREATE TABLE "onboarding_next_of_kin" (
  "id" serial PRIMARY KEY NOT NULL,
  "submission_id" integer NOT NULL,
  "name" text NOT NULL,
  "relationship" text,
  "email" text,
  "address" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_next_of_kin"
  ADD CONSTRAINT "onboarding_next_of_kin_submission_id_fk"
  FOREIGN KEY ("submission_id") REFERENCES "onboarding_submissions"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- ── Onboarding staging: next of kin phones ─────────────────────────────────
CREATE TABLE "onboarding_next_of_kin_phones" (
  "id" serial PRIMARY KEY NOT NULL,
  "kin_id" integer NOT NULL,
  "number" text NOT NULL,
  "label" text DEFAULT 'Mobile' NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_next_of_kin_phones"
  ADD CONSTRAINT "onboarding_next_of_kin_phones_kin_id_fk"
  FOREIGN KEY ("kin_id") REFERENCES "onboarding_next_of_kin"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- ── Onboarding staging: medical & dietary ──────────────────────────────────
CREATE TABLE "onboarding_medical" (
  "id" serial PRIMARY KEY NOT NULL,
  "submission_id" integer NOT NULL,
  "medical_selections" text[],
  "medical_notes" text,
  "dietary_selections" text[],
  "dietary_notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_medical"
  ADD CONSTRAINT "onboarding_medical_submission_id_fk"
  FOREIGN KEY ("submission_id") REFERENCES "onboarding_submissions"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- ── Onboarding staging: disclosure ─────────────────────────────────────────
CREATE TABLE "onboarding_disclosures" (
  "id" serial PRIMARY KEY NOT NULL,
  "submission_id" integer NOT NULL,
  "check_type" text NOT NULL,
  "check_level" text NOT NULL,
  "certificate_number" text,
  "issue_date" date,
  "on_update_service" boolean DEFAULT false NOT NULL,
  "update_service_consent_name" text,
  "conviction_details" text,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_disclosures"
  ADD CONSTRAINT "onboarding_disclosures_submission_id_fk"
  FOREIGN KEY ("submission_id") REFERENCES "onboarding_submissions"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- ── Employee disclosure update service consents ─────────────────────────────
CREATE TABLE "employee_disclosure_update_service_consents" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL,
  "disclosure_id" integer,
  "consent_granted" boolean DEFAULT false NOT NULL,
  "signatory_name" text,
  "consented_at" timestamptz,
  "ip_address" text,
  "pdf_attachment_id" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_disclosure_update_service_consents"
  ADD CONSTRAINT "edus_consents_employee_id_fk"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "employee_disclosure_update_service_consents"
  ADD CONSTRAINT "edus_consents_disclosure_id_fk"
  FOREIGN KEY ("disclosure_id") REFERENCES "employee_disclosures"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "employee_disclosure_update_service_consents"
  ADD CONSTRAINT "edus_consents_pdf_fk"
  FOREIGN KEY ("pdf_attachment_id") REFERENCES "employee_attachments"("id") ON DELETE SET NULL;
