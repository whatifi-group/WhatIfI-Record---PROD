/**
 * Idempotent LOV seed — runs at server startup.
 * Inserts any missing system LOV items; safe to re-run on every boot.
 *
 * IMPORTANT — schema-backed categories:
 *   `employee_status`, `employment_type`, `shift_type`, `user_status`, and
 *   `leave_status` entries are auto-derived from DB schema constants
 *   (`employeeStatusValues`, `employmentTypeValues`, `shiftTypeValues`,
 *   `userStatusValues`, `leaveStatusValues`).
 *   Adding a value to any of those constants is sufficient — no manual
 *   seed update required.
 *   All other categories are maintained in the `MANUAL_ITEMS` list below.
 */
import {
  db,
  lovItemsTable,
  employeeStatusValues,
  employmentTypeValues,
  shiftTypeValues,
  userStatusValues,
  leaveStatusValues,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** snake_case → "Title Case" label. e.g. "on_leave" → "On Leave" */
function toLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface SeedItem {
  category: string;
  value: string;
  label: string;
  sortOrder: number;
}

// ── Schema-backed categories ──────────────────────────────────────────────────
// These are auto-derived from the canonical schema constants so they cannot
// drift. When a developer adds a value to either constant the seed includes
// it automatically — no manual step required.

/**
 * The authoritative mapping of LOV category → schema constant values.
 * Exported so tests can assert the mapping is complete without hitting the DB.
 */
export const SCHEMA_BACKED_CATEGORIES = {
  employee_status: employeeStatusValues as readonly string[],
  employment_type: employmentTypeValues as readonly string[],
  shift_type: shiftTypeValues as readonly string[],
  user_status: userStatusValues as readonly string[],
  leave_status: leaveStatusValues as readonly string[],
} satisfies Record<string, readonly string[]>;

const schemaBackedItems: SeedItem[] = Object.entries(
  SCHEMA_BACKED_CATEGORIES,
).flatMap(([category, values]) =>
  values.map((value, i) => ({
    category,
    value,
    label: toLabel(value),
    sortOrder: i + 1,
  })),
);

// ── Manually maintained categories ────────────────────────────────────────────
// These have no single source-of-truth schema constant; labels and ordering
// matter and are curated here intentionally.

const MANUAL_ITEMS: SeedItem[] = [
  // leaver_reason
  { category: "leaver_reason", value: "resignation",     label: "Resignation",     sortOrder: 1 },
  { category: "leaver_reason", value: "redundancy",      label: "Redundancy",      sortOrder: 2 },
  { category: "leaver_reason", value: "retirement",      label: "Retirement",      sortOrder: 3 },
  { category: "leaver_reason", value: "end_of_contract", label: "End of Contract", sortOrder: 4 },
  { category: "leaver_reason", value: "dismissal",       label: "Dismissal",       sortOrder: 5 },
  { category: "leaver_reason", value: "other",           label: "Other",           sortOrder: 6 },
  // medical_condition
  { category: "medical_condition", value: "diabetes",            label: "Diabetes",            sortOrder: 1 },
  { category: "medical_condition", value: "asthma",              label: "Asthma",              sortOrder: 2 },
  { category: "medical_condition", value: "epilepsy",            label: "Epilepsy",            sortOrder: 3 },
  { category: "medical_condition", value: "heart_condition",     label: "Heart Condition",     sortOrder: 4 },
  { category: "medical_condition", value: "mobility_impairment", label: "Mobility Impairment", sortOrder: 5 },
  // dietary_requirement
  { category: "dietary_requirement", value: "vegetarian",  label: "Vegetarian",  sortOrder: 1 },
  { category: "dietary_requirement", value: "vegan",       label: "Vegan",       sortOrder: 2 },
  { category: "dietary_requirement", value: "gluten_free", label: "Gluten Free", sortOrder: 3 },
  { category: "dietary_requirement", value: "nut_allergy", label: "Nut Allergy", sortOrder: 4 },
  { category: "dietary_requirement", value: "dairy_free",  label: "Dairy Free",  sortOrder: 5 },
  { category: "dietary_requirement", value: "halal",       label: "Halal",       sortOrder: 6 },
  { category: "dietary_requirement", value: "kosher",      label: "Kosher",      sortOrder: 7 },
  // disclosure_check_type
  { category: "disclosure_check_type", value: "dbs",       label: "DBS",       sortOrder: 1 },
  { category: "disclosure_check_type", value: "pvg",       label: "PVG",       sortOrder: 2 },
  { category: "disclosure_check_type", value: "access_ni", label: "AccessNI", sortOrder: 3 },
  // disclosure_check_level_dbs — DBS supports all four levels
  { category: "disclosure_check_level_dbs", value: "basic",           label: "Basic",                       sortOrder: 1 },
  { category: "disclosure_check_level_dbs", value: "standard",        label: "Standard",                    sortOrder: 2 },
  { category: "disclosure_check_level_dbs", value: "enhanced",        label: "Enhanced",                    sortOrder: 3 },
  { category: "disclosure_check_level_dbs", value: "enhanced_barred", label: "Enhanced with Barred Lists",  sortOrder: 4 },
  // disclosure_check_level_pvg — PVG (Scotland) has no "basic" level
  { category: "disclosure_check_level_pvg", value: "standard",        label: "Standard",                    sortOrder: 1 },
  { category: "disclosure_check_level_pvg", value: "enhanced",        label: "Enhanced",                    sortOrder: 2 },
  { category: "disclosure_check_level_pvg", value: "enhanced_barred", label: "Enhanced with Barred Lists",  sortOrder: 3 },
  // disclosure_check_level_access_ni — AccessNI (Northern Ireland) supports all four levels
  { category: "disclosure_check_level_access_ni", value: "basic",           label: "Basic",                      sortOrder: 1 },
  { category: "disclosure_check_level_access_ni", value: "standard",        label: "Standard",                   sortOrder: 2 },
  { category: "disclosure_check_level_access_ni", value: "enhanced",        label: "Enhanced",                   sortOrder: 3 },
  { category: "disclosure_check_level_access_ni", value: "enhanced_barred", label: "Enhanced with Barred Lists", sortOrder: 4 },
  // disclosure_recommendation
  { category: "disclosure_recommendation", value: "approved",       label: "Approved to Work",        sortOrder: 1 },
  { category: "disclosure_recommendation", value: "not_approved",   label: "Not Approved",             sortOrder: 2 },
  { category: "disclosure_recommendation", value: "further_review", label: "Further Review Needed",    sortOrder: 3 },
  // qualification_duration_unit
  { category: "qualification_duration_unit", value: "days",   label: "Days",   sortOrder: 1 },
  { category: "qualification_duration_unit", value: "months", label: "Months", sortOrder: 2 },
  { category: "qualification_duration_unit", value: "years",  label: "Years",  sortOrder: 3 },
  // system_config — shared onboarding passphrase (HR managers set the value via the UI)
  { category: "system_config", value: "onboarding_password", label: "Onboarding Password", sortOrder: 1 },
];

const SEED_ITEMS: SeedItem[] = [...schemaBackedItems, ...MANUAL_ITEMS];

// ── Seed function ─────────────────────────────────────────────────────────────

export async function seedLov(): Promise<void> {
  for (const item of SEED_ITEMS) {
    const [existing] = await db
      .select({ id: lovItemsTable.id })
      .from(lovItemsTable)
      .where(
        and(
          eq(lovItemsTable.category, item.category),
          eq(lovItemsTable.value, item.value),
        ),
      );
    if (!existing) {
      await db.insert(lovItemsTable).values({
        category: item.category,
        value: item.value,
        label: item.label,
        sortOrder: item.sortOrder,
        isActive: true,
        isSystem: true,
      });
    }
  }
}

// ── Sync assertion ────────────────────────────────────────────────────────────

/**
 * Queries the database and throws if any schema-backed enum value is missing
 * from `lov_items`. Call this after `seedLov()` at startup so a schema/seed
 * drift is caught immediately rather than producing silent UI breakage.
 */
export async function assertLovSync(): Promise<void> {
  const missing: string[] = [];

  for (const [category, values] of Object.entries(SCHEMA_BACKED_CATEGORIES)) {
    const rows = await db
      .select({ value: lovItemsTable.value })
      .from(lovItemsTable)
      .where(eq(lovItemsTable.category, category));

    const dbValues = new Set(rows.map((r) => r.value));

    for (const v of values) {
      if (!dbValues.has(v)) {
        missing.push(`  category="${category}" value="${v}"`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `LOV sync check failed — the following schema enum values have no lov_items row:\n${missing.join("\n")}\n` +
        "Add the missing values to seedLov.ts or update the schema constant.",
    );
  }
}
