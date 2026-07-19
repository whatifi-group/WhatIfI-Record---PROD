import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeePayroll";
import {
  buildApp,
  cleanupEmployee,
  cleanupRole,
  cleanupUser,
  createTestEmployee,
  createTestRole,
  createTestUser,
} from "./helpers";
import { db, usersTable, userRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Payroll routes are gated behind requirePermission(["view_payroll", "sysadmin"]).
// We create one sysadmin role + user for the whole suite and inject the userId
// via a fake session so the permission middleware can do its normal DB lookup.
let roleId: number;
let userId: number;
let api: ReturnType<typeof buildApp>;

// Additional roles/users for permission guard tests
let viewOnlyRoleId: number;
let viewOnlyUserId: number;
let viewPayrollRoleId: number;
let viewPayrollUserId: number;
// User whose role lacks view_payroll but it is granted as an individual override
let individualPermBaseRoleId: number;
let individualPermUserId: number;

beforeAll(async () => {
  roleId = await createTestRole(["sysadmin"]);
  userId = await createTestUser(roleId);
  api = buildApp(router, userId);

  // view_employees only — must be denied payroll access
  viewOnlyRoleId = await createTestRole(["view_employees"]);
  viewOnlyUserId = await createTestUser(viewOnlyRoleId);

  // view_payroll via role — must be allowed
  viewPayrollRoleId = await createTestRole(["view_payroll"]);
  viewPayrollUserId = await createTestUser(viewPayrollRoleId);

  // view_employees role but view_payroll granted as a user-level permission override
  individualPermBaseRoleId = await createTestRole(["view_employees"]);
  const [u] = await db
    .insert(usersTable)
    .values({
      name: "IndividualPerm User",
      email: `individual-perm-${Date.now()}@example-test.invalid`,
      passwordHash: "not-a-real-hash",
      permissions: ["view_payroll"] as never,
    })
    .returning({ id: usersTable.id });
  await db.insert(userRolesTable).values({ userId: u.id, roleId: individualPermBaseRoleId });
  individualPermUserId = u.id;
});

afterAll(async () => {
  await cleanupUser(userId);
  await cleanupRole(roleId);
  await cleanupUser(viewOnlyUserId);
  await cleanupRole(viewOnlyRoleId);
  await cleanupUser(viewPayrollUserId);
  await cleanupRole(viewPayrollRoleId);
  await cleanupUser(individualPermUserId);
  await cleanupRole(individualPermBaseRoleId);
});

describe("Employee Payroll", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  // ── GET ──────────────────────────────────────────────────────────────────

  describe("GET /api/employees/:id/payroll", () => {
    it("returns 404 when no payroll record exists yet", async () => {
      const res = await api.get(`/api/employees/${empId}/payroll`);
      expect(res.status).toBe(404);
    });

    it("returns the payroll record after it has been created", async () => {
      await api
        .put(`/api/employees/${empId}/payroll`)
        .send({ employeeNumber: "EMP001" });

      const res = await api.get(`/api/employees/${empId}/payroll`);
      expect(res.status).toBe(200);
      expect(res.body.employeeNumber).toBe("EMP001");
      expect(res.body.employeeId).toBe(empId);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api.get("/api/employees/abc/payroll");
      expect(res.status).toBe(400);
    });
  });

  // ── GET /payroll — permission guard ──────────────────────────────────────

  describe("GET /api/employees/:id/payroll — permission guard", () => {
    beforeEach(async () => {
      // Seed a payroll record so a 200 response is possible
      await api.put(`/api/employees/${empId}/payroll`).send({ employeeNumber: "GUARD001" });
    });

    it("returns 403 for a caller without view_payroll (view_employees only)", async () => {
      const restricted = buildApp(router, viewOnlyUserId);
      const res = await restricted.get(`/api/employees/${empId}/payroll`);
      expect(res.status).toBe(403);
    });

    it("returns 200 for a caller whose role includes view_payroll", async () => {
      const authorized = buildApp(router, viewPayrollUserId);
      const res = await authorized.get(`/api/employees/${empId}/payroll`);
      expect(res.status).toBe(200);
      expect(res.body.employeeNumber).toBe("GUARD001");
    });

    it("returns 200 for a caller granted view_payroll as an individual permission override", async () => {
      const authorized = buildApp(router, individualPermUserId);
      const res = await authorized.get(`/api/employees/${empId}/payroll`);
      expect(res.status).toBe(200);
      expect(res.body.employeeNumber).toBe("GUARD001");
    });

    it("returns 403 for an unauthenticated request (no session)", async () => {
      const anon = buildApp(router);
      const res = await anon.get(`/api/employees/${empId}/payroll`);
      expect(res.status).toBe(401);
    });
  });

  // ── PUT (upsert) ──────────────────────────────────────────────────────────

  describe("PUT /api/employees/:id/payroll", () => {
    it("creates a payroll record on first call", async () => {
      const res = await api
        .put(`/api/employees/${empId}/payroll`)
        .send({ bankName: "Nationwide", accountNumber: "12345678" });

      expect(res.status).toBe(200);
      expect(res.body.bankName).toBe("Nationwide");
      expect(res.body.accountNumber).toBe("12345678");
      expect(res.body.employeeId).toBe(empId);
    });

    it("updates an existing payroll record on subsequent calls", async () => {
      await api
        .put(`/api/employees/${empId}/payroll`)
        .send({ bankName: "First Bank" });

      const res = await api
        .put(`/api/employees/${empId}/payroll`)
        .send({ bankName: "Second Bank", sortCode: "01-02-03" });

      expect(res.status).toBe(200);
      expect(res.body.bankName).toBe("Second Bank");
      expect(res.body.sortCode).toBe("01-02-03");
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api
        .put("/api/employees/abc/payroll")
        .send({ bankName: "x" });
      expect(res.status).toBe(400);
    });
  });
});
