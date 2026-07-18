CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"head_employee_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"job_title" text NOT NULL,
	"department_id" integer,
	"employment_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" date NOT NULL,
	"salary" numeric(12, 2),
	"avatar_url" text,
	"leaver_reason" text,
	"leaver_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"address_type" text DEFAULT 'home' NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text,
	"county" text,
	"postcode" text,
	"country" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_payroll" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"employee_number" text,
	"ni_number" text,
	"bank_name" text,
	"account_holder" text,
	"sort_code" text,
	"account_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_payroll_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "employee_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_type" text,
	"file_size_bytes" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_medical_notes" (
	"employee_id" integer PRIMARY KEY NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_medical_selections" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"lov_value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_dietary_notes" (
	"employee_id" integer PRIMARY KEY NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_dietary_selections" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"lov_value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_next_of_kin" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"name" text NOT NULL,
	"relationship" text,
	"email" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"awarding_body" text,
	"validity_value" integer,
	"validity_unit" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qualification_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "employee_qualifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"qualification_type_id" integer NOT NULL,
	"date_achieved" date NOT NULL,
	"expiry_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verification_notes" text,
	"verified_by" integer,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "qualification_revalidations" (
	"id" serial PRIMARY KEY NOT NULL,
	"qualification_id" integer NOT NULL,
	"previous_date_achieved" date NOT NULL,
	"previous_expiry_date" date,
	"revalidated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "qualification_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"qualification_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_work_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"shift_date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"hours_worked" numeric(6, 2),
	"shift_type" text DEFAULT 'regular' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_pay_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"shift_type" text NOT NULL,
	"rate" numeric(10, 2) NOT NULL,
	"rate_unit" text DEFAULT 'hourly' NOT NULL,
	"notes" text,
	"effective_from" date DEFAULT CURRENT_DATE NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_service_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"end_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_disclosure_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"disclosure_id" integer NOT NULL,
	"recommendation" text NOT NULL,
	"reviewer_notes" text,
	"review_date" date NOT NULL,
	"signed_off_by_user_id" integer,
	"signed_off_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_disclosure_reviews_disclosure_id_unique" UNIQUE("disclosure_id")
);
--> statement-breakpoint
CREATE TABLE "employee_disclosure_update_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"disclosure_id" integer NOT NULL,
	"checked_date" date NOT NULL,
	"result" text NOT NULL,
	"checked_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_disclosures" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"check_type" text NOT NULL,
	"check_level" text NOT NULL,
	"certificate_number" text,
	"issue_date" date NOT NULL,
	"on_update_service" boolean DEFAULT false NOT NULL,
	"conviction_details" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_phones" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"number" text NOT NULL,
	"label" text DEFAULT 'Mobile' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_next_of_kin_phones" (
	"id" serial PRIMARY KEY NOT NULL,
	"kin_id" integer NOT NULL,
	"number" text NOT NULL,
	"label" text DEFAULT 'Mobile' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_disclosure_update_service_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"disclosure_id" integer,
	"consent_granted" boolean DEFAULT false NOT NULL,
	"signatory_name" text,
	"consented_at" timestamp with time zone,
	"ip_address" text,
	"pdf_attachment_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"role_id" integer NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_login_at" timestamp with time zone,
	"is_system_account" boolean DEFAULT false NOT NULL,
	"employee_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "lov_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "onboarding_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"job_title" text,
	"department_id" integer,
	"employment_type" text,
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
CREATE TABLE "onboarding_submission_qualifications" (
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
CREATE TABLE "onboarding_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"line1" text,
	"line2" text,
	"city" text,
	"county" text,
	"postcode" text,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_medical" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"medical_selections" text[],
	"medical_notes" text,
	"dietary_selections" text[],
	"dietary_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_next_of_kin_phones" (
	"id" serial PRIMARY KEY NOT NULL,
	"kin_id" integer NOT NULL,
	"number" text NOT NULL,
	"label" text DEFAULT 'Mobile' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_next_of_kin" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"name" text NOT NULL,
	"relationship" text,
	"email" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_addresses" ADD CONSTRAINT "employee_addresses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll" ADD CONSTRAINT "employee_payroll_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_attachments" ADD CONSTRAINT "employee_attachments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_medical_notes" ADD CONSTRAINT "employee_medical_notes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_medical_selections" ADD CONSTRAINT "employee_medical_selections_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_dietary_notes" ADD CONSTRAINT "employee_dietary_notes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_dietary_selections" ADD CONSTRAINT "employee_dietary_selections_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_next_of_kin" ADD CONSTRAINT "employee_next_of_kin_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_qualifications" ADD CONSTRAINT "employee_qualifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_qualifications" ADD CONSTRAINT "employee_qualifications_qualification_type_id_qualification_types_id_fk" FOREIGN KEY ("qualification_type_id") REFERENCES "public"."qualification_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_qualifications" ADD CONSTRAINT "employee_qualifications_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_revalidations" ADD CONSTRAINT "qualification_revalidations_qualification_id_employee_qualifications_id_fk" FOREIGN KEY ("qualification_id") REFERENCES "public"."employee_qualifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_certificates" ADD CONSTRAINT "qualification_certificates_qualification_id_employee_qualifications_id_fk" FOREIGN KEY ("qualification_id") REFERENCES "public"."employee_qualifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_records" ADD CONSTRAINT "employee_work_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay_rates" ADD CONSTRAINT "employee_pay_rates_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_service_periods" ADD CONSTRAINT "employee_service_periods_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disclosure_reviews" ADD CONSTRAINT "employee_disclosure_reviews_disclosure_id_employee_disclosures_id_fk" FOREIGN KEY ("disclosure_id") REFERENCES "public"."employee_disclosures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disclosure_reviews" ADD CONSTRAINT "employee_disclosure_reviews_signed_off_by_user_id_users_id_fk" FOREIGN KEY ("signed_off_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disclosure_update_checks" ADD CONSTRAINT "employee_disclosure_update_checks_disclosure_id_employee_disclosures_id_fk" FOREIGN KEY ("disclosure_id") REFERENCES "public"."employee_disclosures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disclosures" ADD CONSTRAINT "employee_disclosures_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_phones" ADD CONSTRAINT "employee_phones_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_next_of_kin_phones" ADD CONSTRAINT "employee_next_of_kin_phones_kin_id_employee_next_of_kin_id_fk" FOREIGN KEY ("kin_id") REFERENCES "public"."employee_next_of_kin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disclosure_update_service_consents" ADD CONSTRAINT "employee_disclosure_update_service_consents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disclosure_update_service_consents" ADD CONSTRAINT "employee_disclosure_update_service_consents_disclosure_id_employee_disclosures_id_fk" FOREIGN KEY ("disclosure_id") REFERENCES "public"."employee_disclosures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disclosure_update_service_consents" ADD CONSTRAINT "employee_disclosure_update_service_consents_pdf_attachment_id_employee_attachments_id_fk" FOREIGN KEY ("pdf_attachment_id") REFERENCES "public"."employee_attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_submission_qualifications" ADD CONSTRAINT "onboarding_submission_qualifications_submission_id_onboarding_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."onboarding_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_submission_qualifications" ADD CONSTRAINT "onboarding_submission_qualifications_qualification_type_id_qualification_types_id_fk" FOREIGN KEY ("qualification_type_id") REFERENCES "public"."qualification_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_addresses" ADD CONSTRAINT "onboarding_addresses_submission_id_onboarding_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."onboarding_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_disclosures" ADD CONSTRAINT "onboarding_disclosures_submission_id_onboarding_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."onboarding_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_medical" ADD CONSTRAINT "onboarding_medical_submission_id_onboarding_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."onboarding_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_next_of_kin_phones" ADD CONSTRAINT "onboarding_next_of_kin_phones_kin_id_onboarding_next_of_kin_id_fk" FOREIGN KEY ("kin_id") REFERENCES "public"."onboarding_next_of_kin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_next_of_kin" ADD CONSTRAINT "onboarding_next_of_kin_submission_id_onboarding_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."onboarding_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ewr_shift_date_emp_idx" ON "employee_work_records" USING btree ("shift_date","employee_id");