-- Add employee_service_periods table to record multiple service periods per employee.
-- The backfill below copies each employee's existing start_date / leaver_date /
-- leaver_reason into the new table so no historical data is lost.
CREATE TABLE IF NOT EXISTS "employee_service_periods" (
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
ALTER TABLE "employee_service_periods" ADD CONSTRAINT "employee_service_periods_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Backfill: seed one row per employee from the legacy columns
INSERT INTO "employee_service_periods" (employee_id, start_date, end_date, end_reason, notes, created_at, updated_at)
SELECT
  e.id,
  e.start_date,
  e.leaver_date,
  e.leaver_reason,
  NULL,
  NOW(),
  NOW()
FROM employees e
WHERE NOT EXISTS (
  SELECT 1 FROM "employee_service_periods" esp WHERE esp.employee_id = e.id
);
