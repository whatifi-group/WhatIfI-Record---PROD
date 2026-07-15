/**
 * Pay-rate date range tests — Task #128
 *
 * Covers:
 *  1. POST stores effectiveFrom / effectiveTo correctly
 *  2. POST rejects effectiveTo < effectiveFrom
 *  3. PUT can close a rate by setting effectiveTo
 *  4. LOV shift_type deactivation closes all open pay rates for that value
 *  5. Copy-from skips source rates that are already closed (inactive)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import payRatesRouter from "../routes/hr/employeePayRates";
import sysadminRouter from "../routes/sysadmin";
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

// ── Shared auth ───────────────────────────────────────────────────────────────

let payrollRoleId: number;
let payrollUserId: number;
let sysadminRoleId: number;
let sysadminUserId: number;

beforeAll(async () => {
  await seedLov();
  payrollRoleId = await createTestRole(["view_payroll"]);
  payrollUserId = await createTestUser(payrollRoleId);
  sysadminRoleId = await createTestRole(["sysadmin"]);
  sysadminUserId = await createTestUser(sysadminRoleId);
});

afterAll(async () => {
  await cleanupUser(payrollUserId);
  await cleanupRole(payrollRoleId);
  await cleanupUser(sysadminUserId);
  await cleanupRole(sysadminRoleId);
});

// ── 1. effectiveFrom / effectiveTo are stored and returned ────────────────────

describe("POST /api/employees/:id/pay-rates — effectiveFrom / effectiveTo", () => {
  let empId: number;

  beforeEach(async () => { empId = await createTestEmployee(); });
  afterEach(async () => { await cleanupEmployee(empId); });

  it("stores effectiveFrom and returns it in the response", async () => {
    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: "2025-01-01" });

    expect(res.status).toBe(201);
    expect(res.body.effectiveFrom).toMatch(/^2025-01-01/);
    expect(res.body.effectiveTo).toBeNull();
  });

  it("stores effectiveTo when provided", async () => {
    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31" });

    expect(res.status).toBe(201);
    expect(res.body.effectiveFrom).toMatch(/^2025-01-01/);
    expect(res.body.effectiveTo).toMatch(/^2025-12-31/);
  });

  it("accepts an ISO datetime string for effectiveFrom (normalises to date)", async () => {
    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: "2025-03-15T00:00:00.000Z" });

    expect(res.status).toBe(201);
    expect(res.body.effectiveFrom).toMatch(/^2025-03-15/);
  });
});

// ── 2. Inverted date range rejected ──────────────────────────────────────────

describe("POST /api/employees/:id/pay-rates — date range validation", () => {
  let empId: number;

  beforeEach(async () => { empId = await createTestEmployee(); });
  afterEach(async () => { await cleanupEmployee(empId); });

  it("returns 400 when effectiveTo is before effectiveFrom", async () => {
    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: "2025-06-01", effectiveTo: "2025-01-01" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/effectiveTo cannot be before effectiveFrom/i);
  });

  it("allows effectiveTo equal to effectiveFrom (same-day range)", async () => {
    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: "2025-06-01", effectiveTo: "2025-06-01" });

    expect(res.status).toBe(201);
  });

  it("returns 400 when PUT sets effectiveTo before existing effectiveFrom", async () => {
    // Create a rate starting 2025-06-01
    const create = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: "2025-06-01" });
    expect(create.status).toBe(201);
    const rateId = create.body.id;

    // Try to close it with a date before it started
    const res = await buildApp(payRatesRouter, payrollUserId)
      .put(`/api/employees/${empId}/pay-rates/${rateId}`)
      .send({ effectiveTo: "2025-01-01" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/effectiveTo cannot be before effectiveFrom/i);
  });
});

// ── 3. PUT closes a rate by setting effectiveTo ───────────────────────────────

describe("PUT /api/employees/:id/pay-rates/:rateId — closing a rate", () => {
  let empId: number;

  beforeEach(async () => { empId = await createTestEmployee(); });
  afterEach(async () => { await cleanupEmployee(empId); });

  it("sets effectiveTo on an open rate and returns the updated row", async () => {
    const create = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 20, rateUnit: "hourly", effectiveFrom: "2025-01-01" });
    expect(create.status).toBe(201);
    const rateId = create.body.id;

    const res = await buildApp(payRatesRouter, payrollUserId)
      .put(`/api/employees/${empId}/pay-rates/${rateId}`)
      .send({ effectiveTo: "2025-12-31" });

    expect(res.status).toBe(200);
    expect(res.body.effectiveTo).toMatch(/^2025-12-31/);
    expect(res.body.effectiveFrom).toMatch(/^2025-01-01/); // unchanged
  });
});

// ── 4. LOV deactivation closes open pay rates ─────────────────────────────────

describe("LOV shift_type deactivation — closes open pay rates", () => {
  let empA: number;
  let empB: number;

  beforeEach(async () => {
    empA = await createTestEmployee();
    empB = await createTestEmployee();
  });
  afterEach(async () => {
    await cleanupEmployee(empA);
    await cleanupEmployee(empB);
  });

  it("sets effectiveTo = today for every open rate of the deactivated shift type", async () => {
    // Insert a temporary custom LOV entry so we don't touch the real ones
    const [lovRow] = await db
      .insert(lovItemsTable)
      .values({ category: "shift_type", value: "test_closure_shift", label: "Test Closure Shift", isActive: true, isSystem: false })
      .returning({ id: lovItemsTable.id });

    // Create two open rates for different employees using that shift type
    await db.insert(employeePayRatesTable).values([
      { employeeId: empA, shiftType: "test_closure_shift", rate: "10", rateUnit: "hourly", effectiveFrom: "2025-01-01" },
      { employeeId: empB, shiftType: "test_closure_shift", rate: "12", rateUnit: "hourly", effectiveFrom: "2025-01-01" },
    ]);

    try {
      // Deactivate the shift type via the sysadmin API
      const res = await buildApp(sysadminRouter, sysadminUserId)
        .patch(`/api/sysadmin/lov/shift_type/${lovRow.id}`)
        .send({ isActive: false });
      expect(res.status).toBe(200);

      // Both rates must now have effectiveTo set to today
      const today = new Date().toISOString().split("T")[0];
      const closed = await db
        .select({ effectiveTo: employeePayRatesTable.effectiveTo })
        .from(employeePayRatesTable)
        .where(eq(employeePayRatesTable.shiftType, "test_closure_shift"));

      expect(closed).toHaveLength(2);
      for (const row of closed) {
        expect(row.effectiveTo).toMatch(new RegExp(`^${today}`));
      }
    } finally {
      await db.delete(lovItemsTable).where(eq(lovItemsTable.id, lovRow.id));
    }
  });

  it("does not close rates for other shift types when a different one is deactivated", async () => {
    const [lovRow] = await db
      .insert(lovItemsTable)
      .values({ category: "shift_type", value: "test_unrelated_deact", label: "Unrelated", isActive: true, isSystem: false })
      .returning({ id: lovItemsTable.id });

    // standard rate on empA — should remain untouched
    const [stdRow] = await db
      .insert(employeePayRatesTable)
      .values({ employeeId: empA, shiftType: "standard", rate: "15", rateUnit: "hourly", effectiveFrom: "2025-01-01" })
      .returning({ id: employeePayRatesTable.id });

    try {
      await buildApp(sysadminRouter, sysadminUserId)
        .patch(`/api/sysadmin/lov/shift_type/${lovRow.id}`)
        .send({ isActive: false });

      // The "standard" rate must still be open
      const [unchanged] = await db
        .select({ effectiveTo: employeePayRatesTable.effectiveTo })
        .from(employeePayRatesTable)
        .where(eq(employeePayRatesTable.id, stdRow.id));

      expect(unchanged.effectiveTo).toBeNull();
    } finally {
      await db.delete(lovItemsTable).where(eq(lovItemsTable.id, lovRow.id));
      await db.delete(employeePayRatesTable).where(eq(employeePayRatesTable.id, stdRow.id));
    }
  });

  it("does not re-close a rate that already has effectiveTo set", async () => {
    const [lovRow] = await db
      .insert(lovItemsTable)
      .values({ category: "shift_type", value: "test_already_closed", label: "Already Closed", isActive: true, isSystem: false })
      .returning({ id: lovItemsTable.id });

    const [rateRow] = await db
      .insert(employeePayRatesTable)
      .values({ employeeId: empA, shiftType: "test_already_closed", rate: "10", rateUnit: "hourly", effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" })
      .returning({ id: employeePayRatesTable.id });

    try {
      await buildApp(sysadminRouter, sysadminUserId)
        .patch(`/api/sysadmin/lov/shift_type/${lovRow.id}`)
        .send({ isActive: false });

      // The pre-existing effectiveTo must NOT be overwritten with today
      const [row] = await db
        .select({ effectiveTo: employeePayRatesTable.effectiveTo })
        .from(employeePayRatesTable)
        .where(eq(employeePayRatesTable.id, rateRow.id));

      expect(row.effectiveTo).toMatch(/^2024-06-30/);
    } finally {
      await db.delete(lovItemsTable).where(eq(lovItemsTable.id, lovRow.id));
      await db.delete(employeePayRatesTable).where(eq(employeePayRatesTable.id, rateRow.id));
    }
  });
});

// ── 5. copy-from skips closed source rates ────────────────────────────────────

describe("POST copy-from — skips source rates that are closed (inactive)", () => {
  let source: number;
  let target: number;

  beforeEach(async () => {
    source = await createTestEmployee();
    target = await createTestEmployee();
  });
  afterEach(async () => {
    await cleanupEmployee(source);
    await cleanupEmployee(target);
  });

  it("does not copy a source rate whose effectiveTo is in the past", async () => {
    // Insert a closed rate on source
    await db.insert(employeePayRatesTable).values({
      employeeId: source,
      shiftType: "standard",
      rate: "15",
      rateUnit: "hourly",
      effectiveFrom: "2020-01-01",
      effectiveTo: "2020-12-31", // closed 5 years ago
    });

    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${target}/pay-rates/copy-from/${source}`);

    expect(res.status).toBe(200);
    expect(res.body.copied).toHaveLength(0);
    expect(res.body.skipped).toContain("standard");
  });

  it("copies an active source rate and sets effectiveFrom to today", async () => {
    const today = new Date().toISOString().split("T")[0];

    // Insert an open (active) rate on source
    await db.insert(employeePayRatesTable).values({
      employeeId: source,
      shiftType: "overtime",
      rate: "25",
      rateUnit: "hourly",
      effectiveFrom: "2024-01-01",
    });

    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${target}/pay-rates/copy-from/${source}`);

    expect(res.status).toBe(200);
    expect(res.body.copied).toHaveLength(1);
    expect(res.body.copied[0].shiftType).toBe("overtime");
    // effectiveFrom on the copy should be today, not the source's historical date
    expect(res.body.copied[0].effectiveFrom).toMatch(new RegExp(`^${today}`));
    expect(res.body.copied[0].effectiveTo).toBeNull();
  });
});
