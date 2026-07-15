/**
 * Task #37 — Protect payroll data on the server when the HR app is bypassed.
 *
 * Salary is a payroll-sensitive field that must be null in GET/PATCH responses
 * for callers without view_payroll or sysadmin permission, regardless of
 * whether the HR frontend is used.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import router from "../routes/hr/employees";
import {
  buildApp,
  cleanupEmployee,
  cleanupRole,
  cleanupUser,
  createTestRole,
  createTestUser,
} from "./helpers";
import { db, employeesTable } from "@workspace/db";

// ── Shared fixtures ───────────────────────────────────────────────────────────
let viewerRoleId: number;
let viewerUserId: number;
let hrManagerRoleId: number;
let hrManagerUserId: number;
let payrollRoleId: number;
let payrollUserId: number;
let sysadminRoleId: number;
let sysadminUserId: number;
let empId: number;

beforeAll(async () => {
  viewerRoleId = await createTestRole(["view_employees"]);
  viewerUserId = await createTestUser(viewerRoleId);

  hrManagerRoleId = await createTestRole(["edit_employees"]);
  hrManagerUserId = await createTestUser(hrManagerRoleId);

  payrollRoleId = await createTestRole(["view_payroll", "view_employees"]);
  payrollUserId = await createTestUser(payrollRoleId);

  sysadminRoleId = await createTestRole(["sysadmin"]);
  sysadminUserId = await createTestUser(sysadminRoleId);

  // Create an employee with a known salary
  const [emp] = await db
    .insert(employeesTable)
    .values({
      firstName: "Salary",
      lastName: "TestEmp",
      email: `salary-test-${Date.now()}@example-test.invalid`,
      jobTitle: "Tester",
      employmentType: "full_time",
      startDate: "2024-01-01",
      salary: "75000",
    })
    .returning({ id: employeesTable.id });
  empId = emp.id;
});

afterAll(async () => {
  await cleanupEmployee(empId);
  await cleanupUser(viewerUserId);
  await cleanupRole(viewerRoleId);
  await cleanupUser(hrManagerUserId);
  await cleanupRole(hrManagerRoleId);
  await cleanupUser(payrollUserId);
  await cleanupRole(payrollRoleId);
  await cleanupUser(sysadminUserId);
  await cleanupRole(sysadminRoleId);
});

// ── GET /employees — salary visibility ───────────────────────────────────────
describe("GET /api/employees — salary visibility", () => {
  it("hides salary (null) from a view_employees-only user", async () => {
    const api = buildApp(router, viewerUserId);
    const res = await api.get("/api/employees");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp).toBeDefined();
    expect(emp.salary).toBeNull();
  });

  it("hides salary (null) from an edit_employees-only user", async () => {
    const api = buildApp(router, hrManagerUserId);
    const res = await api.get("/api/employees");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp.salary).toBeNull();
  });

  it("returns salary to a user with view_payroll", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api.get("/api/employees");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp.salary).toBe(75000);
  });

  it("returns salary to a sysadmin user", async () => {
    const api = buildApp(router, sysadminUserId);
    const res = await api.get("/api/employees");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp.salary).toBe(75000);
  });
});

// ── GET /employees/:id — salary visibility ────────────────────────────────────
describe("GET /api/employees/:id — salary visibility", () => {
  it("hides salary (null) from a view_employees-only user", async () => {
    const api = buildApp(router, viewerUserId);
    const res = await api.get(`/api/employees/${empId}`);
    expect(res.status).toBe(200);
    expect(res.body.salary).toBeNull();
  });

  it("returns salary to a user with view_payroll", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api.get(`/api/employees/${empId}`);
    expect(res.status).toBe(200);
    expect(res.body.salary).toBe(75000);
  });

  it("returns salary to a sysadmin", async () => {
    const api = buildApp(router, sysadminUserId);
    const res = await api.get(`/api/employees/${empId}`);
    expect(res.status).toBe(200);
    expect(res.body.salary).toBe(75000);
  });
});

// ── PATCH /employees/:id — salary hidden in response without view_payroll ─────
describe("PATCH /api/employees/:id — salary hidden in response without view_payroll", () => {
  it("edit_employees user can update employee but sees null salary in response", async () => {
    const api = buildApp(router, hrManagerUserId);
    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ jobTitle: "Senior Tester" });
    expect(res.status).toBe(200);
    expect(res.body.salary).toBeNull();
  });

  it("sysadmin user can update and sees salary in response", async () => {
    const api = buildApp(router, sysadminUserId);
    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ jobTitle: "Lead Tester" });
    expect(res.status).toBe(200);
    expect(res.body.salary).toBe(75000);
  });
});
