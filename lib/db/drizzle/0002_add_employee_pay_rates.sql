-- Add employee_pay_rates table (created via push earlier; now captured as a proper migration)
CREATE TABLE IF NOT EXISTS "employee_pay_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"shift_type" text NOT NULL,
	"rate" numeric(10, 2) NOT NULL,
	"rate_unit" text DEFAULT 'hourly' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_pay_rates_employee_id_shift_type_unique" UNIQUE("employee_id","shift_type")
);
--> statement-breakpoint
ALTER TABLE "employee_pay_rates" ADD CONSTRAINT "employee_pay_rates_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
