/**
 * Task #59 — Confirm the copy-rates endpoint rejects invalid requests
 * and handles edge cases correctly.
 *
 * Endpoint: POST /employees/:id/pay-rates/copy-from/:sourceId
 * Guard:    requirePermission(["view_payroll", "sysadmin"])
 *
 * Cases covered:
 * - Auth: unauthenticated → 401; wrong permission → 403
 * - Params: non-numeric id / sourceId → 400
 * - Same-employee copy (id === sourceId) → 400
 * - Source has no rates → { copied: [], skipped: [] }
 * - Target is empty → all source rates are copied
 * - Target already has some shift types → conflicts skipped, rest copied
 * - Target already has all shift types → everything skipped, nothing copied
 * - Copied rates have correct field values (rate, rateUnit, notes)
 * - Copied rates are independent of source (inserting on target doesn't affect source)
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
import { db, employeePayRatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Shared auth fixtures ──────────────────────────────────────────────────────
let payrollRoleId: number;
let payrollUserId: number;
let sysadminRoleId: number;
let sysadminUserId: number;
let noPayrollRoleId: number;
let noPayrollUserId: number;

beforeAll(async () => {
  payrollRoleId = await createTestRole(["view_payroll"]);
  payrollUserId = await createTestUser(payrollRoleId);

  sysadminRoleId = await createTestRole(["sysadmin"]);
  sysadminUserId = await createTestUser(sysadminRoleId);

  noPayrollRoleId = await createTestRole(["view_employees"]);
  noPayrollUserId = await createTestUser(noPayrollRoleId);
});

afterAll(async () => {
  await cleanupUser(payrollUserId);
  await cleanupRole(payrollRoleId);
  await cleanupUser(sysadminUserId);
  await cleanupRole(sysadminRoleId);
  await cleanupUser(noPayrollUserId);
  await cleanupRole(noPayrollRoleId);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function insertPayRate(
  employeeId: number,
  shiftType: string,
  rate = 10,
  rateUnit: "hourly" | "daily" | "flat" = "hourly",
  notes: string | null = null,
) {
  await db.insert(employeePayRatesTable).values({
    employeeId,
    shiftType,
    rate: String(rate),
    rateUnit,
    notes,
  });
}

async function getPayRates(employeeId: number) {
  return db
    .select()
    .from(employeePayRatesTable)
    .where(eq(employeePayRatesTable.employeeId, employeeId));
}

// ── Auth & permission guard ───────────────────────────────────────────────────

describe("POST /api/employees/:id/pay-rates/copy-from/:sourceId — auth", () => {
  let empA: number;
  let empB: number;

  beforeAll(async () => {
    empA = await createTestEmployee();
    empB = await createTestEmployee();
  });

  afterAll(async () => {
    await cleanupEmployee(empA);
    await cleanupEmployee(empB);
  });

  it("returns 401 when no session is present", async () => {
    const api = buildApp(router); // no userId
    const res = await api.post(`/api/employees/${empA}/pay-rates/copy-from/${empB}`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks view_payroll and sysadmin", async () => {
    const api = buildApp(router, noPayrollUserId);
    const res = await api.post(`/api/employees/${empA}/pay-rates/copy-from/${empB}`);
    expect(res.status).toBe(403);
  });

  it("returns 200 for a user with view_payroll", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api.post(`/api/employees/${empA}/pay-rates/copy-from/${empB}`);
    expect(res.status).toBe(200);
  });

  it("returns 200 for a sysadmin user", async () => {
    const api = buildApp(router, sysadminUserId);
    const res = await api.post(`/api/employees/${empA}/pay-rates/copy-from/${empB}`);
    expect(res.status).toBe(200);
  });
});

// ── Input validation ──────────────────────────────────────────────────────────

describe("POST /api/employees/:id/pay-rates/copy-from/:sourceId — input validation", () => {
  let empA: number;
  let empB: number;

  beforeAll(async () => {
    empA = await createTestEmployee();
    empB = await createTestEmployee();
  });

  afterAll(async () => {
    await cleanupEmployee(empA);
    await cleanupEmployee(empB);
  });

  it("returns 400 for a non-numeric target id", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api.post(`/api/employees/abc/pay-rates/copy-from/${empB}`);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-numeric sourceId", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api.post(`/api/employees/${empA}/pay-rates/copy-from/xyz`);
    expect(res.status).toBe(400);
  });

  it("returns 400 when target id and sourceId are the same employee", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${empA}/pay-rates/copy-from/${empA}`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/same employee/i);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("POST /api/employees/:id/pay-rates/copy-from/:sourceId — edge cases", () => {
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

  it("returns { copied: [], skipped: [] } when the source employee has no rates", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ copied: [], skipped: [] });
  });

  it("copies all source rates when the target has none", async () => {
    await insertPayRate(source, "standard", 15, "hourly", "Standard shift");
    await insertPayRate(source, "weekend", 20, "daily");

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied).toHaveLength(2);
    expect(res.body.skipped).toEqual([]);

    const copiedShiftTypes = res.body.copied.map((r: { shiftType: string }) => r.shiftType);
    expect(copiedShiftTypes).toContain("standard");
    expect(copiedShiftTypes).toContain("weekend");
  });

  it("preserves rate, rateUnit, and notes when copying", async () => {
    await insertPayRate(source, "night_shift", 25.5, "flat", "Late shift bonus");

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );

    expect(res.status).toBe(200);
    const copied = res.body.copied[0];
    expect(copied.shiftType).toBe("night_shift");
    expect(copied.rate).toBe(25.5);
    expect(copied.rateUnit).toBe("flat");
    expect(copied.notes).toBe("Late shift bonus");
    expect(copied.employeeId).toBe(target); // belongs to target, not source
  });

  it("skips shift types already on the target and copies the rest", async () => {
    await insertPayRate(source, "standard", 15);
    await insertPayRate(source, "weekend", 20);
    await insertPayRate(source, "overtime", 30);
    // Target already has "standard"
    await insertPayRate(target, "standard", 12);

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied).toHaveLength(2);
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].shiftType).toBe("standard");
    expect(res.body.skipped[0].reason).toBe("conflict");

    const copiedTypes = res.body.copied.map((r: { shiftType: string }) => r.shiftType);
    expect(copiedTypes).toContain("weekend");
    expect(copiedTypes).toContain("overtime");
    expect(copiedTypes).not.toContain("standard");
  });

  it("skips everything and copies nothing when all shift types conflict", async () => {
    await insertPayRate(source, "standard", 15);
    await insertPayRate(source, "weekend", 20);
    await insertPayRate(target, "standard", 10);
    await insertPayRate(target, "weekend", 18);

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied).toEqual([]);
    expect(res.body.skipped).toHaveLength(2);
    const skippedTypes = res.body.skipped.map((s: { shiftType: string }) => s.shiftType);
    expect(skippedTypes).toContain("standard");
    expect(skippedTypes).toContain("weekend");
    expect(res.body.skipped.every((s: { reason: string }) => s.reason === "conflict")).toBe(true);
  });

  it("does not modify the source employee's rates", async () => {
    await insertPayRate(source, "standard", 15);

    const api = buildApp(router, payrollUserId);
    await api.post(`/api/employees/${target}/pay-rates/copy-from/${source}`);

    const sourceRates = await getPayRates(source);
    expect(sourceRates).toHaveLength(1);
    expect(sourceRates[0].shiftType).toBe("standard");
  });

  it("sysadmin user can also use the copy endpoint", async () => {
    await insertPayRate(source, "bank_holiday", 40, "daily");

    const api = buildApp(router, sysadminUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied).toHaveLength(1);
    expect(res.body.copied[0].shiftType).toBe("bank_holiday");
  });

  it("handles null notes in source rates correctly (copies as null)", async () => {
    await insertPayRate(source, "standard", 10, "hourly", null);

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied[0].notes).toBeNull();
  });
});

// ── Overwrite behaviour ───────────────────────────────────────────────────────

describe("POST /api/employees/:id/pay-rates/copy-from/:sourceId?overwrite=true — overwrite", () => {
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

  it("replaces a conflicting shift type on the target with the source values", async () => {
    await insertPayRate(source, "standard", 25, "hourly", "New rate");
    await insertPayRate(target, "standard", 10, "hourly", "Old rate");

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}?overwrite=true`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied).toHaveLength(1);
    expect(res.body.skipped).toEqual([]);

    const copied = res.body.copied[0];
    expect(copied.shiftType).toBe("standard");
    expect(copied.rate).toBe(25);
    expect(copied.notes).toBe("New rate");
    expect(copied.employeeId).toBe(target);
  });

  it("places previously-skipped rates in copied when overwrite=true", async () => {
    await insertPayRate(source, "standard", 15);
    await insertPayRate(source, "weekend", 20);
    await insertPayRate(target, "standard", 12);

    const api = buildApp(router, payrollUserId);

    // Without overwrite: standard is skipped
    const resNoOverwrite = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );
    expect(resNoOverwrite.body.skipped.map((s: { shiftType: string }) => s.shiftType)).toContain("standard");

    // With overwrite: standard should now be in copied
    const resOverwrite = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}?overwrite=true`,
    );
    expect(resOverwrite.status).toBe(200);
    expect(resOverwrite.body.skipped).toEqual([]);
    const copiedTypes = resOverwrite.body.copied.map((r: { shiftType: string }) => r.shiftType);
    expect(copiedTypes).toContain("standard");
    expect(copiedTypes).toContain("weekend");
  });

  it("overwrites all conflicting rates when all shift types conflict", async () => {
    await insertPayRate(source, "standard", 30, "daily", "Source standard");
    await insertPayRate(source, "weekend", 40, "flat", "Source weekend");
    await insertPayRate(target, "standard", 10);
    await insertPayRate(target, "weekend", 18);

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}?overwrite=true`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied).toHaveLength(2);
    expect(res.body.skipped).toEqual([]);

    const copiedByType = Object.fromEntries(
      res.body.copied.map((r: { shiftType: string; rate: number; rateUnit: string }) => [
        r.shiftType,
        r,
      ]),
    );
    expect(copiedByType["standard"].rate).toBe(30);
    expect(copiedByType["standard"].rateUnit).toBe("daily");
    expect(copiedByType["weekend"].rate).toBe(40);
    expect(copiedByType["weekend"].rateUnit).toBe("flat");
  });

  it("inserts non-conflicting rates and overwrites conflicting ones in a single call", async () => {
    await insertPayRate(source, "standard", 20); // conflicts
    await insertPayRate(source, "overtime", 35); // no conflict
    await insertPayRate(target, "standard", 10);

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}?overwrite=true`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied).toHaveLength(2);
    expect(res.body.skipped).toEqual([]);

    const copiedTypes = res.body.copied.map((r: { shiftType: string }) => r.shiftType);
    expect(copiedTypes).toContain("standard");
    expect(copiedTypes).toContain("overtime");
  });

  it("does not modify the source employee's rates during overwrite", async () => {
    await insertPayRate(source, "standard", 20, "hourly", "Source note");
    await insertPayRate(target, "standard", 10);

    const api = buildApp(router, payrollUserId);
    await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}?overwrite=true`,
    );

    const sourceRates = await getPayRates(source);
    expect(sourceRates).toHaveLength(1);
    expect(sourceRates[0].shiftType).toBe("standard");
    expect(Number(sourceRates[0].rate)).toBe(20);
    expect(sourceRates[0].notes).toBe("Source note");
  });

  it("default behaviour (no param) still skips conflicts even after overwrite was used previously", async () => {
    await insertPayRate(source, "standard", 25);
    await insertPayRate(target, "standard", 10);

    const api = buildApp(router, payrollUserId);
    const res = await api.post(
      `/api/employees/${target}/pay-rates/copy-from/${source}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.copied).toEqual([]);
    expect(res.body.skipped.map((s: { shiftType: string }) => s.shiftType)).toContain("standard");
  });
});
