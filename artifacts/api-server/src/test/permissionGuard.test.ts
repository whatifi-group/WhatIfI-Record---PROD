/**
 * Permission-guard integration tests.
 *
 * Verify that authenticated users who lack the required permission receive 403
 * from every `requirePermission`-gated route.  These tests use real DB rows
 * (via createTestRole/createTestUser) so that `getEffectivePermissions` runs
 * its normal DB path — no mocking means a future permission misconfiguration
 * will be caught automatically.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import hrRouter from "../routes/hr";
import {
  buildApp,
  createTestEmployee,
  cleanupEmployee,
  createTestRole,
  cleanupRole,
  createTestUser,
  cleanupUser,
} from "./helpers";

// ── shared state ─────────────────────────────────────────────────────────────

let employeeId: number;

// A role with zero permissions — stands in for any employee-level user who
// should not see sensitive data.
let noPermRoleId: number;
let noPermUserId: number;

// A role with only `view_payroll` — cannot edit employees or access sysadmin.
let payrollRoleId: number;
let payrollUserId: number;

// A role with only `edit_employees` — cannot view payroll.
let editRoleId: number;
let editUserId: number;

beforeAll(async () => {
  employeeId = await createTestEmployee();

  noPermRoleId = await createTestRole([], "No Permissions");
  noPermUserId = await createTestUser(noPermRoleId);

  payrollRoleId = await createTestRole(["view_payroll"], "Payroll Only");
  payrollUserId = await createTestUser(payrollRoleId);

  editRoleId = await createTestRole(["edit_employees"], "Edit Employees Only");
  editUserId = await createTestUser(editRoleId);
});

afterAll(async () => {
  await cleanupEmployee(employeeId);
  await cleanupUser(noPermUserId);
  await cleanupRole(noPermRoleId);
  await cleanupUser(payrollUserId);
  await cleanupRole(payrollRoleId);
  await cleanupUser(editUserId);
  await cleanupRole(editRoleId);
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** Returns a supertest agent authenticated as `userId`. */
function api(userId: number) {
  return buildApp(hrRouter, userId);
}

const EMP = () => employeeId;

// ── Payroll — view_payroll required ──────────────────────────────────────────

describe("Permission guard — payroll routes require view_payroll", () => {
  it("GET /api/employees/:id/payroll → 403 for user without view_payroll", async () => {
    const res = await api(noPermUserId).get(`/api/employees/${EMP()}/payroll`);
    expect(res.status).toBe(403);
  });

  it("PUT /api/employees/:id/payroll → 403 for user without view_payroll", async () => {
    const res = await api(noPermUserId)
      .put(`/api/employees/${EMP()}/payroll`)
      .send({ bankName: "Barclays" });
    expect(res.status).toBe(403);
  });

  // Sanity: user WITH view_payroll reaches the route (404 because there is no
  // payroll record yet, but NOT 403).
  it("GET /api/employees/:id/payroll → not 403 for user with view_payroll", async () => {
    const res = await api(payrollUserId).get(`/api/employees/${EMP()}/payroll`);
    expect(res.status).not.toBe(403);
  });
});

// ── Pay rates — view_payroll required ────────────────────────────────────────

describe("Permission guard — pay rate routes require view_payroll", () => {
  it("GET /api/employees/:id/pay-rates → 403 for user without view_payroll", async () => {
    const res = await api(noPermUserId).get(`/api/employees/${EMP()}/pay-rates`);
    expect(res.status).toBe(403);
  });

  it("POST /api/employees/:id/pay-rates → 403 for user without view_payroll", async () => {
    const res = await api(noPermUserId)
      .post(`/api/employees/${EMP()}/pay-rates`)
      .send({ shiftType: "standard", rate: 12.5, rateUnit: "hourly" });
    expect(res.status).toBe(403);
  });

  it("PUT /api/employees/:id/pay-rates/:rateId → 403 for user without view_payroll", async () => {
    const res = await api(noPermUserId)
      .put(`/api/employees/${EMP()}/pay-rates/1`)
      .send({ rate: 13 });
    expect(res.status).toBe(403);
  });

  it("DELETE /api/employees/:id/pay-rates/:rateId → 403 for user without view_payroll", async () => {
    const res = await api(noPermUserId).delete(
      `/api/employees/${EMP()}/pay-rates/1`,
    );
    expect(res.status).toBe(403);
  });

  it("POST /api/employees/:id/pay-rates/copy-from/:sourceId → 403 for user without view_payroll", async () => {
    const res = await api(noPermUserId).post(
      `/api/employees/${EMP()}/pay-rates/copy-from/999`,
    );
    expect(res.status).toBe(403);
  });

  // Sanity: view_payroll user reaches the route (200 with empty array, not 403).
  it("GET /api/employees/:id/pay-rates → not 403 for user with view_payroll", async () => {
    const res = await api(payrollUserId).get(`/api/employees/${EMP()}/pay-rates`);
    expect(res.status).not.toBe(403);
  });
});

// ── Employee mutation — edit_employees required ───────────────────────────────

describe("Permission guard — PATCH employee requires edit_employees", () => {
  it("PATCH /api/employees/:id → 403 for user without edit_employees", async () => {
    const res = await api(noPermUserId)
      .patch(`/api/employees/${EMP()}`)
      .send({ jobTitle: "Hacker" });
    expect(res.status).toBe(403);
  });

  // A payroll-only user also cannot edit employees.
  it("PATCH /api/employees/:id → 403 for payroll-only user", async () => {
    const res = await api(payrollUserId)
      .patch(`/api/employees/${EMP()}`)
      .send({ jobTitle: "Hacker" });
    expect(res.status).toBe(403);
  });

  // Sanity: edit_employees user reaches the route (not 403).
  it("PATCH /api/employees/:id → not 403 for user with edit_employees", async () => {
    const res = await api(editUserId)
      .patch(`/api/employees/${EMP()}`)
      .send({ jobTitle: "Tester" });
    expect(res.status).not.toBe(403);
  });
});

// ── Employee deletion — sysadmin required ────────────────────────────────────

describe("Permission guard — DELETE employee requires sysadmin", () => {
  it("DELETE /api/employees/:id → 403 for user without sysadmin", async () => {
    const res = await api(noPermUserId).delete(`/api/employees/${EMP()}`);
    expect(res.status).toBe(403);
  });

  it("DELETE /api/employees/:id → 403 for edit_employees user (not sysadmin)", async () => {
    const res = await api(editUserId).delete(`/api/employees/${EMP()}`);
    expect(res.status).toBe(403);
  });

  it("DELETE /api/employees/:id → 403 for payroll-only user (not sysadmin)", async () => {
    const res = await api(payrollUserId).delete(`/api/employees/${EMP()}`);
    expect(res.status).toBe(403);
  });
});
