import { afterEach, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeePayroll";
import { buildApp, cleanupEmployee, createTestEmployee } from "./helpers";

const api = buildApp(router);

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
