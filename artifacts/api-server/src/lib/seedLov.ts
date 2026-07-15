/**
 * Idempotent LOV seed — runs at server startup.
 * Inserts any missing system LOV items; safe to re-run on every boot.
 */
import { db, lovItemsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

interface SeedItem {
  category: string;
  value: string;
  label: string;
  sortOrder: number;
}

const SEED_ITEMS: SeedItem[] = [
  // employee_status
  { category: "employee_status", value: "active",   label: "Active",   sortOrder: 1 },
  { category: "employee_status", value: "inactive", label: "Inactive", sortOrder: 2 },
  { category: "employee_status", value: "on_leave", label: "On Leave", sortOrder: 3 },
  { category: "employee_status", value: "leaver",   label: "Leaver",   sortOrder: 4 },
  // employment_type
  { category: "employment_type", value: "full_time", label: "Full Time",  sortOrder: 1 },
  { category: "employment_type", value: "part_time", label: "Part Time",  sortOrder: 2 },
  { category: "employment_type", value: "contract",  label: "Contract",   sortOrder: 3 },
  { category: "employment_type", value: "intern",    label: "Intern",     sortOrder: 4 },
  // leaver_reason
  { category: "leaver_reason", value: "resignation",       label: "Resignation",       sortOrder: 1 },
  { category: "leaver_reason", value: "redundancy",        label: "Redundancy",        sortOrder: 2 },
  { category: "leaver_reason", value: "retirement",        label: "Retirement",        sortOrder: 3 },
  { category: "leaver_reason", value: "end_of_contract",   label: "End of Contract",   sortOrder: 4 },
  { category: "leaver_reason", value: "dismissal",         label: "Dismissal",         sortOrder: 5 },
  { category: "leaver_reason", value: "other",             label: "Other",             sortOrder: 6 },
  // medical_condition
  { category: "medical_condition", value: "diabetes", label: "Diabetes", sortOrder: 1 },
  { category: "medical_condition", value: "asthma", label: "Asthma", sortOrder: 2 },
  { category: "medical_condition", value: "epilepsy", label: "Epilepsy", sortOrder: 3 },
  { category: "medical_condition", value: "heart_condition", label: "Heart Condition", sortOrder: 4 },
  { category: "medical_condition", value: "mobility_impairment", label: "Mobility Impairment", sortOrder: 5 },
  // dietary_requirement
  { category: "dietary_requirement", value: "vegetarian", label: "Vegetarian", sortOrder: 1 },
  { category: "dietary_requirement", value: "vegan", label: "Vegan", sortOrder: 2 },
  { category: "dietary_requirement", value: "gluten_free", label: "Gluten Free", sortOrder: 3 },
  { category: "dietary_requirement", value: "nut_allergy", label: "Nut Allergy", sortOrder: 4 },
  { category: "dietary_requirement", value: "dairy_free", label: "Dairy Free", sortOrder: 5 },
  { category: "dietary_requirement", value: "halal", label: "Halal", sortOrder: 6 },
  { category: "dietary_requirement", value: "kosher", label: "Kosher", sortOrder: 7 },
  // shift_type
  { category: "shift_type", value: "standard", label: "Standard", sortOrder: 1 },
  { category: "shift_type", value: "overtime", label: "Overtime", sortOrder: 2 },
  { category: "shift_type", value: "night_shift", label: "Night Shift", sortOrder: 3 },
  { category: "shift_type", value: "weekend", label: "Weekend", sortOrder: 4 },
  { category: "shift_type", value: "bank_holiday", label: "Bank Holiday", sortOrder: 5 },
  { category: "shift_type", value: "on_call", label: "On-Call", sortOrder: 6 },
];

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
