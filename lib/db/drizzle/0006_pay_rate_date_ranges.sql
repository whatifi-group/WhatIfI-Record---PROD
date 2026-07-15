-- Add effective_from / effective_to date range columns to employee_pay_rates.
-- effective_from defaults to CURRENT_DATE for any new rows inserted without it.
-- Existing rows are backfilled from created_at so historical data is preserved.
-- The (employee_id, shift_type) unique constraint is also dropped to allow multiple
-- date-ranged rows per shift type (e.g. a closed historical rate alongside a new one).

ALTER TABLE "employee_pay_rates"
  ADD COLUMN "effective_from" date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN "effective_to"   date;
--> statement-breakpoint
-- Backfill existing rows: use created_at date rather than today
UPDATE "employee_pay_rates"
SET "effective_from" = "created_at"::date;
--> statement-breakpoint
-- Drop the unique constraint so multiple date-ranged rows can coexist
ALTER TABLE "employee_pay_rates"
  DROP CONSTRAINT IF EXISTS "employee_pay_rates_employee_id_shift_type_unique";
