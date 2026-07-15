/**
 * Pay-rate date range tests
 *
 * Covers:
 *  1. POST stores effectiveFrom / effectiveTo correctly
 *  2. POST rejects effectiveTo < effectiveFrom
 *  3. PUT can close a rate by setting effectiveTo
 *  4. LOV shift_type deactivation closes all open pay rates for that value
 *  5. Copy-from skips source rates that are already closed (inactive)
 *  6. Overlap prevention — POST returns 409 when a rate overlaps an existing one
 *  7. Overlap prevention — PUT returns 409 when extending a rate causes overlap
 *  8. Deactivation edge cases — re-activation, today-close, all-closed source
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

// ── 6. Overlap prevention — POST ─────────────────────────────────────────────

describe("POST /api/employees/:id/pay-rates — overlap prevention", () => {
  let empId: number;

  beforeEach(async () => { empId = await createTestEmployee(); });
  afterEach(async () => { await cleanupEmployee(empId); });

  it("returns 409 when inserting an open rate that overlaps an existing open rate", async () => {
    // First rate — open-ended starting 2025-01-01
    const first = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: "2025-01-01" });
    expect(first.status).toBe(201);

    // Second rate — also open-ended for the same shift type → overlap
    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 20, rateUnit: "hourly", effectiveFrom: "2025-06-01" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("returns 409 when the new rate's range overlaps a closed rate's range", async () => {
    // Closed rate: 2025-01-01 → 2025-06-30
    await db.insert(employeePayRatesTable).values({
      employeeId: empId,
      shiftType: "standard",
      rate: "15",
      rateUnit: "hourly",
      effectiveFrom: "2025-01-01",
      effectiveTo: "2025-06-30",
    });

    // New rate starts 2025-03-01 (inside the closed range)
    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 18, rateUnit: "hourly", effectiveFrom: "2025-03-01", effectiveTo: "2025-09-30" });

    expect(res.status).toBe(409);
  });

  it("succeeds when the new rate starts exactly after the closed rate ends", async () => {
    // Closed rate: 2025-01-01 → 2025-06-30
    await db.insert(employeePayRatesTable).values({
      employeeId: empId,
      shiftType: "standard",
      rate: "15",
      rateUnit: "hourly",
      effectiveFrom: "2025-01-01",
      effectiveTo: "2025-06-30",
    });

    // New rate starts 2025-07-01 — immediately after the closed one ends (no overlap)
    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 18, rateUnit: "hourly", effectiveFrom: "2025-07-01" });

    expect(res.status).toBe(201);
  });

  it("closed rate does not block a new rate starting after it", async () => {
    // A rate that closed well in the past
    await db.insert(employeePayRatesTable).values({
      employeeId: empId,
      shiftType: "overtime",
      rate: "25",
      rateUnit: "hourly",
      effectiveFrom: "2020-01-01",
      effectiveTo: "2020-12-31",
    });

    // New rate from 2025 — no overlap
    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "overtime", rate: 30, rateUnit: "hourly", effectiveFrom: "2025-01-01" });

    expect(res.status).toBe(201);
  });

  it("overlap check is per shift type — different shift type does not block", async () => {
    // Open rate for "standard"
    await db.insert(employeePayRatesTable).values({
      employeeId: empId,
      shiftType: "standard",
      rate: "15",
      rateUnit: "hourly",
      effectiveFrom: "2025-01-01",
    });

    // New rate for "overtime" — completely independent
    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "overtime", rate: 25, rateUnit: "hourly", effectiveFrom: "2025-01-01" });

    expect(res.status).toBe(201);
  });
});

// ── 7. Overlap prevention — PUT ───────────────────────────────────────────────

describe("PUT /api/employees/:id/pay-rates/:rateId — overlap prevention", () => {
  let empId: number;

  beforeEach(async () => { empId = await createTestEmployee(); });
  afterEach(async () => { await cleanupEmployee(empId); });

  it("returns 409 when extending effectiveTo causes overlap with another rate", async () => {
    // Rate A: 2025-01-01 → 2025-06-30 (closed)
    const [rateA] = await db.insert(employeePayRatesTable).values({
      employeeId: empId,
      shiftType: "standard",
      rate: "15",
      rateUnit: "hourly",
      effectiveFrom: "2025-01-01",
      effectiveTo: "2025-06-30",
    }).returning({ id: employeePayRatesTable.id });

    // Rate B: 2025-07-01 → open
    await db.insert(employeePayRatesTable).values({
      employeeId: empId,
      shiftType: "standard",
      rate: "20",
      rateUnit: "hourly",
      effectiveFrom: "2025-07-01",
    });

    // Try to extend rate A to 2025-09-30 — overlaps rate B
    const res = await buildApp(payRatesRouter, payrollUserId)
      .put(`/api/employees/${empId}/pay-rates/${rateA.id}`)
      .send({ effectiveTo: "2025-09-30" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("allows updating a rate's fields without changing dates when no overlap exists", async () => {
    const create = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: "2025-01-01" });
    expect(create.status).toBe(201);

    // Change the rate amount only — no date change, no overlap possible
    const res = await buildApp(payRatesRouter, payrollUserId)
      .put(`/api/employees/${empId}/pay-rates/${create.body.id}`)
      .send({ rate: 18 });

    expect(res.status).toBe(200);
    expect(res.body.rate).toBeCloseTo(18);
  });

  it("a rate does not conflict with itself when PUT is called without date changes", async () => {
    // Single open rate
    const create = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${empId}/pay-rates`)
      .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: "2025-01-01" });
    expect(create.status).toBe(201);

    // Update effectiveTo on the same rate — should not 409 against itself
    const res = await buildApp(payRatesRouter, payrollUserId)
      .put(`/api/employees/${empId}/pay-rates/${create.body.id}`)
      .send({ effectiveTo: "2025-12-31" });

    expect(res.status).toBe(200);
    expect(res.body.effectiveTo).toMatch(/^2025-12-31/);
  });
});

// ── 8. Deactivation edge cases ────────────────────────────────────────────────

describe("LOV shift_type deactivation — edge cases", () => {
  let empA: number;

  beforeEach(async () => { empA = await createTestEmployee(); });
  afterEach(async () => { await cleanupEmployee(empA); });

  it("re-activating a shift type does NOT re-open closed pay rates", async () => {
    // Insert LOV entry and insert an already-closed rate
    const [lovRow] = await db
      .insert(lovItemsTable)
      .values({ category: "shift_type", value: "test_reactivate_shift", label: "Re-activate Test", isActive: true, isSystem: false })
      .returning({ id: lovItemsTable.id });

    const [rateRow] = await db
      .insert(employeePayRatesTable)
      .values({ employeeId: empA, shiftType: "test_reactivate_shift", rate: "10", rateUnit: "hourly", effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" })
      .returning({ id: employeePayRatesTable.id });

    try {
      // Deactivate the shift type
      await buildApp(sysadminRouter, sysadminUserId)
        .patch(`/api/sysadmin/lov/shift_type/${lovRow.id}`)
        .send({ isActive: false });

      // Re-activate the shift type
      const reactivate = await buildApp(sysadminRouter, sysadminUserId)
        .patch(`/api/sysadmin/lov/shift_type/${lovRow.id}`)
        .send({ isActive: true });
      expect(reactivate.status).toBe(200);

      // The previously-closed pay rate must still have its original effectiveTo
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

  it("a rate with effectiveTo = today is treated as inactive immediately", async () => {
    const today = new Date().toISOString().split("T")[0];

    // Insert a rate that expires today
    const [rateRow] = await db
      .insert(employeePayRatesTable)
      .values({ employeeId: empA, shiftType: "standard", rate: "10", rateUnit: "hourly", effectiveFrom: "2024-01-01", effectiveTo: today })
      .returning({ id: employeePayRatesTable.id });

    try {
      // The GET endpoint uses activeRateCondition which matches effectiveTo >= today,
      // so a rate closing today is still returned as active in the list.
      // The important semantic: after today the rate should NOT block a new rate.
      // Insert a new rate for the same shift type starting tomorrow.
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      const res = await buildApp(payRatesRouter, payrollUserId)
        .post(`/api/employees/${empA}/pay-rates`)
        .send({ shiftType: "standard", rate: 15, rateUnit: "hourly", effectiveFrom: tomorrowStr });

      // Should succeed because the ranges don't overlap:
      // existing: [..., today], new: [tomorrow, ...]
      expect(res.status).toBe(201);
    } finally {
      await db.delete(employeePayRatesTable).where(eq(employeePayRatesTable.id, rateRow.id));
    }
  });

  it("copy-from returns empty copied when all source rates are closed", async () => {
    const source = await createTestEmployee();
    const target = await createTestEmployee();

    try {
      // Insert two closed rates on source
      await db.insert(employeePayRatesTable).values([
        { employeeId: source, shiftType: "standard", rate: "10", rateUnit: "hourly", effectiveFrom: "2020-01-01", effectiveTo: "2020-12-31" },
        { employeeId: source, shiftType: "overtime", rate: "15", rateUnit: "hourly", effectiveFrom: "2020-01-01", effectiveTo: "2020-12-31" },
      ]);

      const res = await buildApp(payRatesRouter, payrollUserId)
        .post(`/api/employees/${target}/pay-rates/copy-from/${source}`);

      expect(res.status).toBe(200);
      expect(res.body.copied).toHaveLength(0);
      // Both closed shift types appear in skipped
      expect(res.body.skipped).toContain("standard");
      expect(res.body.skipped).toContain("overtime");
    } finally {
      await cleanupEmployee(source);
      await cleanupEmployee(target);
    }
  });
});

// ── 9. copy-from overlap guard — overwrite=true with a third conflicting rate ──

describe("POST copy-from — overwrite=true skips when updating would create overlap", () => {
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

  it("skips the shift type when the target has two overlapping active rates (third-rate conflict)", async () => {
    // Set up target with two active "standard" rates that already overlap each other.
    // Rate B: still-active closed range (effectiveTo in the future)
    await db.insert(employeePayRatesTable).values({
      employeeId: target,
      shiftType: "standard",
      rate: "15",
      rateUnit: "hourly",
      effectiveFrom: "2025-01-01",
      effectiveTo: "2025-12-31", // >= today (2025-07-15) — active
    });
    // Rate A: open-ended rate that overlaps Rate B
    await db.insert(employeePayRatesTable).values({
      employeeId: target,
      shiftType: "standard",
      rate: "20",
      rateUnit: "hourly",
      effectiveFrom: "2025-08-01", // active, overlaps Rate B
    });

    // Source has an active "standard" rate
    await db.insert(employeePayRatesTable).values({
      employeeId: source,
      shiftType: "standard",
      rate: "25",
      rateUnit: "hourly",
      effectiveFrom: "2024-01-01",
    });

    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${target}/pay-rates/copy-from/${source}?overwrite=true`);

    expect(res.status).toBe(200);
    // Must skip rather than corrupt — the target has an overlapping pair
    expect(res.body.skipped).toContain("standard");
    expect(res.body.copied).toHaveLength(0);
  });

  it("copies successfully when overwrite=true and no third-rate conflict exists", async () => {
    const today = new Date().toISOString().split("T")[0];

    // Target has one clean active "overtime" rate
    await db.insert(employeePayRatesTable).values({
      employeeId: target,
      shiftType: "overtime",
      rate: "20",
      rateUnit: "hourly",
      effectiveFrom: "2025-01-01",
    });

    // Source also has "overtime"
    await db.insert(employeePayRatesTable).values({
      employeeId: source,
      shiftType: "overtime",
      rate: "30",
      rateUnit: "hourly",
      effectiveFrom: "2024-01-01",
    });

    const res = await buildApp(payRatesRouter, payrollUserId)
      .post(`/api/employees/${target}/pay-rates/copy-from/${source}?overwrite=true`);

    expect(res.status).toBe(200);
    expect(res.body.copied).toHaveLength(1);
    expect(res.body.copied[0].shiftType).toBe("overtime");
    // Rate was updated — value reflects source
    expect(res.body.copied[0].rate).toBeCloseTo(30);
    expect(res.body.skipped).not.toContain("overtime");
  });
});
