-- Create employee_phones table
CREATE TABLE IF NOT EXISTS "employee_phones" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL,
  "number" text NOT NULL,
  "label" text NOT NULL DEFAULT 'Mobile',
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "employee_phones"
  ADD CONSTRAINT "employee_phones_employee_id_fk"
  FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Create employee_next_of_kin_phones table
CREATE TABLE IF NOT EXISTS "employee_next_of_kin_phones" (
  "id" serial PRIMARY KEY NOT NULL,
  "kin_id" integer NOT NULL,
  "number" text NOT NULL,
  "label" text NOT NULL DEFAULT 'Mobile',
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "employee_next_of_kin_phones"
  ADD CONSTRAINT "employee_next_of_kin_phones_kin_id_fk"
  FOREIGN KEY ("kin_id") REFERENCES "public"."employee_next_of_kin"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Migrate existing employee phone values into employee_phones
INSERT INTO "employee_phones" ("employee_id", "number", "label", "is_primary")
SELECT "id", "phone", 'Mobile', true
FROM "employees"
WHERE "phone" IS NOT NULL AND "phone" != '';
--> statement-breakpoint

-- Migrate existing next-of-kin phone values into employee_next_of_kin_phones
INSERT INTO "employee_next_of_kin_phones" ("kin_id", "number", "label", "is_primary")
SELECT "id", "phone", 'Mobile', true
FROM "employee_next_of_kin"
WHERE "phone" IS NOT NULL AND "phone" != '';
--> statement-breakpoint

-- Drop old phone columns
ALTER TABLE "employees" DROP COLUMN IF EXISTS "phone";
--> statement-breakpoint
ALTER TABLE "employee_next_of_kin" DROP COLUMN IF EXISTS "phone";
