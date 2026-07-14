import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const sql = `
CREATE TABLE IF NOT EXISTS "employee_addresses" (
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
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_addresses_employee_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "employee_payroll" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL,
  "employee_number" text,
  "ni_number" text,
  "bank_name" text,
  "account_holder" text,
  "sort_code" text,
  "account_number" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_payroll_employee_id_unique" UNIQUE("employee_id"),
  CONSTRAINT "employee_payroll_employee_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "employee_attachments" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL,
  "file_name" text NOT NULL,
  "file_url" text NOT NULL,
  "file_type" text,
  "file_size_bytes" integer,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_attachments_employee_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "employee_medical_notes" (
  "employee_id" integer PRIMARY KEY NOT NULL,
  "notes" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_medical_notes_employee_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "employee_medical_selections" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL,
  "lov_value" text NOT NULL,
  CONSTRAINT "employee_medical_selections_employee_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "employee_dietary_notes" (
  "employee_id" integer PRIMARY KEY NOT NULL,
  "notes" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_dietary_notes_employee_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "employee_dietary_selections" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL,
  "lov_value" text NOT NULL,
  CONSTRAINT "employee_dietary_selections_employee_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "employee_next_of_kin" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL,
  "name" text NOT NULL,
  "relationship" text,
  "phone" text,
  "email" text,
  "address" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_next_of_kin_employee_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "employee_qualifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL,
  "title" text NOT NULL,
  "institution" text,
  "year_obtained" integer,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_qualifications_employee_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "employee_work_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL,
  "shift_date" date NOT NULL,
  "start_time" text,
  "end_time" text,
  "hours_worked" numeric(6, 2),
  "shift_type" text DEFAULT 'regular' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_work_records_employee_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);

-- Seed LOV items for medical_condition
INSERT INTO lov_items (category, value, label, sort_order, is_active, is_system)
SELECT 'medical_condition', value, label, sort_order, true, true
FROM (VALUES
  ('diabetes',              'Diabetes',              1),
  ('asthma',               'Asthma',                2),
  ('epilepsy',             'Epilepsy',              3),
  ('heart_condition',      'Heart Condition',       4),
  ('mobility_impairment',  'Mobility Impairment',   5)
) AS t(value, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM lov_items WHERE category = 'medical_condition' AND value = t.value
);

-- Seed LOV items for dietary_requirement
INSERT INTO lov_items (category, value, label, sort_order, is_active, is_system)
SELECT 'dietary_requirement', value, label, sort_order, true, true
FROM (VALUES
  ('vegetarian',   'Vegetarian',   1),
  ('vegan',        'Vegan',        2),
  ('gluten_free',  'Gluten Free',  3),
  ('nut_allergy',  'Nut Allergy',  4),
  ('dairy_free',   'Dairy Free',   5),
  ('halal',        'Halal',        6),
  ('kosher',       'Kosher',       7)
) AS t(value, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM lov_items WHERE category = 'dietary_requirement' AND value = t.value
);
`;

try {
  await client.query(sql);
  console.log("✅ Migration applied successfully");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
