-- Add composite index on (shift_date, employee_id) to employee_work_records.
-- Covers the dominant paginated query pattern: date-range filter + employee scope.
CREATE INDEX IF NOT EXISTS "ewr_shift_date_emp_idx" ON "employee_work_records" ("shift_date","employee_id");
