import { beforeAll, describe, expect, it } from "vitest";
import { employeeStatusValues, employmentTypeValues, shiftTypeValues } from "@workspace/db";
import { assertLovSync, SCHEMA_BACKED_CATEGORIES, seedLov } from "../lib/seedLov";

// Ensure the LOV table is seeded before running assertions.
beforeAll(async () => {
  await seedLov();
});

// ── Unit: schema constants are fully reflected in the mapping ─────────────────
// These tests catch drift between the exported SCHEMA_BACKED_CATEGORIES map
// and the canonical schema constants — no DB access required.

describe("SCHEMA_BACKED_CATEGORIES mapping", () => {
  it("employee_status entry covers every value in employeeStatusValues", () => {
    const seeded = SCHEMA_BACKED_CATEGORIES.employee_status;
    for (const v of employeeStatusValues) {
      expect(seeded, `"${v}" missing from employee_status mapping`).toContain(v);
    }
  });

  it("employment_type entry covers every value in employmentTypeValues", () => {
    const seeded = SCHEMA_BACKED_CATEGORIES.employment_type;
    for (const v of employmentTypeValues) {
      expect(seeded, `"${v}" missing from employment_type mapping`).toContain(v);
    }
  });

  it("employee_status mapping has no values absent from the schema constant", () => {
    const schemaSet = new Set<string>(employeeStatusValues);
    for (const v of SCHEMA_BACKED_CATEGORIES.employee_status) {
      expect(
        schemaSet.has(v),
        `"${v}" is in the seed mapping but not in employeeStatusValues — remove it`,
      ).toBe(true);
    }
  });

  it("employment_type mapping has no values absent from the schema constant", () => {
    const schemaSet = new Set<string>(employmentTypeValues);
    for (const v of SCHEMA_BACKED_CATEGORIES.employment_type) {
      expect(
        schemaSet.has(v),
        `"${v}" is in the seed mapping but not in employmentTypeValues — remove it`,
      ).toBe(true);
    }
  });

  it("shift_type entry covers every value in shiftTypeValues", () => {
    const seeded = SCHEMA_BACKED_CATEGORIES.shift_type;
    for (const v of shiftTypeValues) {
      expect(seeded, `"${v}" missing from shift_type mapping`).toContain(v);
    }
  });

  it("shift_type mapping has no values absent from the schema constant", () => {
    const schemaSet = new Set<string>(shiftTypeValues);
    for (const v of SCHEMA_BACKED_CATEGORIES.shift_type) {
      expect(
        schemaSet.has(v),
        `"${v}" is in the seed mapping but not in shiftTypeValues — remove it`,
      ).toBe(true);
    }
  });
});

// ── Integration: lov_items table is fully in sync after seeding ───────────────
// assertLovSync() queries the live database and throws a descriptive error if
// any schema-backed enum value is missing from lov_items.

describe("assertLovSync (DB integration)", () => {
  it("passes without error after seedLov() has run", async () => {
    await expect(assertLovSync()).resolves.not.toThrow();
  });

  it("covers the specific values that previously caused drift (leaver, on_leave)", async () => {
    // Regression guard: these are the values that were historically forgotten.
    const { db, lovItemsTable } = await import("@workspace/db");
    const { eq, and } = await import("drizzle-orm");

    for (const value of ["leaver", "on_leave"] as const) {
      const [row] = await db
        .select({ value: lovItemsTable.value })
        .from(lovItemsTable)
        .where(
          and(
            eq(lovItemsTable.category, "employee_status"),
            eq(lovItemsTable.value, value),
          ),
        );
      expect(row, `lov_items missing employee_status value="${value}"`).toBeDefined();
    }
  });
});
