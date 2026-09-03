/**
 * Task #37 — Protect payroll data on the server when the HR app is bypassed.
 *
 * Salary is a payroll-sensitive field that must be null in GET/PATCH responses
 * for callers without view_payroll or sysadmin permission, regardless of
 * whether the HR frontend is used.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import router from "../routes/hr/index";
import {
  buildApp,
  cleanupEmployee,
  cleanupRole,
  cleanupUser,
  createTestRole,
  createTestUser,
  safeCleanup,
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
  // safeCleanup swallows errors so that a partially-failed beforeAll (which
  // leaves some ids as undefined) cannot prevent the remaining teardown steps
  // from running, avoiding stale rows that would break subsequent test runs.
  await safeCleanup(() => cleanupEmployee(empId));
  await safeCleanup(() => cleanupUser(viewerUserId));
  await safeCleanup(() => cleanupRole(viewerRoleId));
  await safeCleanup(() => cleanupUser(hrManagerUserId));
  await safeCleanup(() => cleanupRole(hrManagerRoleId));
  await safeCleanup(() => cleanupUser(payrollUserId));
  await safeCleanup(() => cleanupRole(payrollRoleId));
  await safeCleanup(() => cleanupUser(sysadminUserId));
  await safeCleanup(() => cleanupRole(sysadminRoleId));
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

// ── GET /employees?search=… — salary still hidden with query params ───────────
describe("GET /api/employees?search — salary visibility with search filter", () => {
  it("hides salary from a view_employees-only user when a search query matches", async () => {
    const api = buildApp(router, viewerUserId);
    // "Salary" matches the employee's firstName created in beforeAll
    const res = await api.get("/api/employees?search=Salary");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp).toBeDefined();
    expect(emp.salary).toBeNull();
  });

  it("hides salary from an edit_employees-only user when a status filter is applied", async () => {
    const api = buildApp(router, hrManagerUserId);
    const res = await api.get("/api/employees?status=active");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    // Employee may or may not appear depending on default status; if present, salary must be null
    if (emp) {
      expect(emp.salary).toBeNull();
    }
  });

  it("returns salary to a view_payroll user when a search query matches", async () => {
    const api = buildApp(router, payrollUserId);
    const res = await api.get("/api/employees?search=TestEmp");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp).toBeDefined();
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

// ── Unauthenticated callers — salary always hidden ────────────────────────────
describe("GET /api/employees — unauthenticated request (no session)", () => {
  it("returns no employee data at all to a caller with no session", async () => {
    // Salary used to be redacted for anonymous callers; the route now requires
    // view_employees|edit_employees|sysadmin, so they get nothing whatsoever.
    // That is strictly stronger than the redaction this test used to assert.
    const api = buildApp(router);
    const res = await api.get("/api/employees");
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty("salary");
  });
});

describe("GET /api/employees/:id — unauthenticated request (no session)", () => {
  it("returns no employee data at all to a caller with no session", async () => {
    const api = buildApp(router);
    const res = await api.get(`/api/employees/${empId}`);
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty("salary");
  });
});

// ── POST /employees — permission guard ────────────────────────────────────────
describe("POST /api/employees — permission guard", () => {
  it("returns 403 for a view_employees-only user", async () => {
    const api = buildApp(router, viewerUserId);
    const res = await api.post("/api/employees").send({
      firstName: "Blocked",
      lastName: "User",
      email: `post-blocked-${Date.now()}@example-test.invalid`,
      jobTitle: "Tester",
      employmentType: "full_time",
      status: "active",
      startDate: "2024-01-01",
      userRoleIds: [viewerRoleId],
      temporaryPassword: "TestPass123!",
    });
    expect(res.status).toBe(403);
  });
});

// ── POST /employees — salary hidden in 201 response without view_payroll ──────
describe("POST /api/employees — salary hidden in 201 response without view_payroll", () => {
  // Track employees created by these tests so afterAll can clean them up
  const createdIds: number[] = [];

  afterAll(async () => {
    for (const id of createdIds) await cleanupEmployee(id);
  });

  it("edit_employees user (no view_payroll) creates an employee and sees null salary in the 201 response", async () => {
    const api = buildApp(router, hrManagerUserId);
    const res = await api.post("/api/employees").send({
      firstName: "PostSalary",
      lastName: "HiddenTest",
      email: `post-salary-hidden-${Date.now()}@example-test.invalid`,
      jobTitle: "Tester",
      employmentType: "full_time",
      status: "active",
      startDate: "2024-01-01",
      salary: 90000,
      userRoleIds: [hrManagerRoleId],
      temporaryPassword: "TestPass123!",
    });
    expect(res.status).toBe(201);
    if (res.body?.id) createdIds.push(res.body.id);
    expect(res.body.salary).toBeNull();
  });

  it("sysadmin user (has view_payroll implicitly) creates an employee and sees the salary value in the 201 response", async () => {
    const api = buildApp(router, sysadminUserId);
    const res = await api.post("/api/employees").send({
      firstName: "PostSalary",
      lastName: "VisibleTest",
      email: `post-salary-visible-${Date.now()}@example-test.invalid`,
      jobTitle: "Tester",
      employmentType: "full_time",
      status: "active",
      startDate: "2024-01-01",
      salary: 80000,
      userRoleIds: [hrManagerRoleId],
      temporaryPassword: "TestPass123!",
    });
    expect(res.status).toBe(201);
    if (res.body?.id) createdIds.push(res.body.id);
    expect(res.body.salary).toBe(80000);
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
