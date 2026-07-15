/**
 * Task #43 — Prevent invalid shift types from being saved to pay rates
 *
 * Endpoints tested:
 *   POST /employees/:id/pay-rates
 *   PUT  /employees/:id/pay-rates/:rateId
 *   POST /employees/:id/pay-rates/copy-from/:sourceId
 *
 * Cases covered:
 *   - POST: valid shiftType → 201
 *   - POST: unknown shiftType → 400
 *   - POST: inactive (deactivated) shiftType → 400
 *   - PUT:  valid shiftType update → 200
 *   - PUT:  unknown shiftType → 400
 *   - PUT:  no shiftType in body → 200 (field not touched)
 *   - copy-from: source rate with inactive shiftType is skipped, not copied
 *   - copy-from: source rate with valid shiftType is still copied normally
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import router from "../routes/hr/employeePayRates";
import {
  buildApp,
  cleanupEmployee,
  cleanupRole,
  cleanupUser,
  createTestEmployee,
  createTestRole,
  createTestUser,
} from "./helpers";
import { db, employeePayRatesTable, lovItemsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { seedLov } from "../lib/seedLov";

// ── Shared auth fixtures ──────────────────────────────────────────────────────

let payrollRoleId: number;
let payrollUserId: number;

beforeAll(async () => {
  // Seed the LOV so that standard shift_type values are active in the DB
  await seedLov();

  payrollRoleId = await createTestRole(["view_payroll"]);
  payrollUserId = await createTestUser(payrollRoleId);
});

afterAll(async () => {
  await cleanupUser(payrollUserId);
  await cleanupRole(payrollRoleId);
});

// ── POST /employees/:id/pay-rates — shiftType validation ─────────────────────

describe("POST /api/employees/:id/pay-rates — shiftType validation", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId); // cascades pay rates
  });

  it("returns 201 when shiftType is a valid active LOV value", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: "2025-01-01" });

    expect(res.status).toBe(201);
    expect(res.body.shiftType).toBe("standard");
    expect(res.body.rate).toBe(15);
  });

  it("returns 400 when shiftType is not in the LOV at all", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "completely_made_up_type", rate: 10, rateUnit: "hourly", effectiveFrom: "2025-01-01" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid shift type/i);
  });

  it("returns 400 when shiftType is a deactivated LOV value", async () => {
    // Insert a temporary inactive LOV entry
    const [row] = await db
      .insert(lovItemsTable)
      .values({
        category: "shift_type",
        value: "test_inactive_shift",
        label: "Test Inactive Shift",
        isActive: false,
        isSystem: false,
      })
      .returning({ id: lovItemsTable.id });

    try {
      const api = buildApp(router, payrollUserId);
      const res = await api
        .post(`/api/employees/${empId}/pay-rates`)
        .send({ shiftType: "test_inactive_shift", rate: 20, rateUnit: "hourly", effectiveFrom: "2025-01-01" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid shift type/i);
    } finally {
      await db.delete(lovItemsTable).where(eq(lovItemsTable.id, row.id));
    }
  });
});

// ── PUT /employees/:id/pay-rates/:rateId — shiftType validation ───────────────

describe("PUT /api/employees/:id/pay-rates/:rateId — shiftType validation", () => {
  let empId: number;
  let rateId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
    // Seed one valid pay rate to update
    const [inserted] = await db
      .insert(employeePayRatesTable)
      .values({ employeeId: empId, shiftType: "standard", rate: "10", rateUnit: "hourly" })
      .returning({ id: employeePayRatesTable.id });
    rateId = inserted.id;
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  it("returns 200 when updating to another valid shiftType", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api
      .put(`/api/employees/${empId}/pay-rates/${rateId}`)
      .send({ shiftType: "overtime" });

    expect(res.status).toBe(200);
    expect(res.body.shiftType).toBe("overtime");
  });

  it("returns 400 when updating shiftType to an unknown value", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api
      .put(`/api/employees/${empId}/pay-rates/${rateId}`)
      .send({ shiftType: "nonexistent_shift" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid shift type/i);
  });

  it("returns 400 when updating shiftType to a deactivated LOV value", async () => {
    const [row] = await db
      .insert(lovItemsTable)
      .values({
        category: "shift_type",
        value: "test_deactivated_put",
        label: "Test Deactivated Put",
        isActive: false,
        isSystem: false,
      })
      .returning({ id: lovItemsTable.id });

    try {
      const api = buildApp(router, payrollUserId);
      const res = await api
        .put(`/api/employees/${empId}/pay-rates/${rateId}`)
        .send({ shiftType: "test_deactivated_put" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid shift type/i);
    } finally {
      await db.delete(lovItemsTable).where(eq(lovItemsTable.id, row.id));
    }
  });

  it("returns 200 when shiftType is omitted from the update body", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api
      .put(`/api/employees/${empId}/pay-rates/${rateId}`)
      .send({ rate: 99 });

    expect(res.status).toBe(200);
    expect(res.body.rate).toBe(99);
    expect(res.body.shiftType).toBe("standard"); // unchanged
  });
});

// ── copy-from — inactive shiftType is not propagated ─────────────────────────

describe("POST /api/employees/:id/pay-rates/copy-from/:sourceId — inactive shiftType skipped", () => {
  let source: number;
  let target: number;
  let inactiveLovId: number;

  beforeEach(async () => {
    source = await createTestEmployee();
    target = await createTestEmployee();

    // Insert a temporary inactive LOV entry
    const [row] = await db
      .insert(lovItemsTable)
      .values({
        category: "shift_type",
        value: "test_inactive_copy",
        label: "Test Inactive Copy",
        isActive: false,
        isSystem: false,
      })
      .returning({ id: lovItemsTable.id });
    inactiveLovId = row.id;
  });

  afterEach(async () => {
    await cleanupEmployee(source);
    await cleanupEmployee(target);
    await db.delete(lovItemsTable).where(eq(lovItemsTable.id, inactiveLovId));
  });

  it("skips source rates whose shiftType is inactive in the LOV", async () => {
    // Seed a rate with an inactive shiftType directly (bypassing the API)
    await db.insert(employeePayRatesTable).values({
      employeeId: source,
      shiftType: "test_inactive_copy",
      rate: "25",
      rateUnit: "hourly",
    });

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied).toEqual([]);
    expect(res.body.skipped[0].shiftType).toBe("test_inactive_copy");
    expect(res.body.skipped[0].reason).toBe("lov_inactive");

    // Confirm nothing was written to the target
    const targetRates = await db
      .select()
      .from(employeePayRatesTable)
      .where(
        and(
          eq(employeePayRatesTable.employeeId, target),
          eq(employeePayRatesTable.shiftType, "test_inactive_copy"),
        ),
      );
    expect(targetRates).toHaveLength(0);
  });

  it("still copies active-LOV rates from the same source while skipping inactive ones", async () => {
    // One valid rate
    await db.insert(employeePayRatesTable).values({
      employeeId: source,
      shiftType: "standard",
      rate: "15",
      rateUnit: "hourly",
    });
    // One inactive rate
    await db.insert(employeePayRatesTable).values({
      employeeId: source,
      shiftType: "test_inactive_copy",
      rate: "25",
      rateUnit: "hourly",
    });

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied).toHaveLength(1);
    expect(res.body.copied[0].shiftType).toBe("standard");
    expect(res.body.skipped.map((s: { shiftType: string }) => s.shiftType)).toContain("test_inactive_copy");
    expect(res.body.skipped[0].reason).toBe("lov_inactive");
  });
});
