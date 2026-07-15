/**
 * Employee phone CRUD — auth, validation, single-primary enforcement,
 * cascade delete, and GET /employees/:id phone embedding tests.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import phonesRouter from "../routes/hr/employeePhones";
import {
  buildApp,
  cleanupEmployee,
  cleanupRole,
  cleanupUser,
  createTestEmployee,
  createTestRole,
  createTestUser,
} from "./helpers";
import { db, employeePhonesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

let roleId: number;
let userId: number;
let api: ReturnType<typeof buildApp>;

beforeAll(async () => {
  roleId = await createTestRole(["edit_employees"]);
  userId = await createTestUser(roleId);
  api = buildApp(phonesRouter, userId);
});

afterAll(async () => {
  await cleanupUser(userId);
  await cleanupRole(roleId);
});

describe("Employee Phones", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  // ── GET list ────────────────────────────────────────────────────────────

  describe("GET /api/employees/:id/phones", () => {
    it("returns empty array for new employee", async () => {
      const res = await api.get(`/api/employees/${empId}/phones`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 400 for non-numeric id", async () => {
      const res = await api.get("/api/employees/abc/phones");
      expect(res.status).toBe(400);
    });
  });

  // ── POST ────────────────────────────────────────────────────────────────

  describe("POST /api/employees/:id/phones", () => {
    it("creates a phone and returns 201", async () => {
      const res = await api
        .post(`/api/employees/${empId}/phones`)
        .send({ number: "07700900000", label: "Mobile", isPrimary: true });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTypeOf("number");
      expect(res.body.number).toBe("07700900000");
      expect(res.body.label).toBe("Mobile");
      expect(res.body.isPrimary).toBe(true);
      expect(res.body.employeeId).toBe(empId);
    });

    it("allows creating with default label", async () => {
      const res = await api
        .post(`/api/employees/${empId}/phones`)
        .send({ number: "07700900001", isPrimary: false });
      expect(res.status).toBe(201);
      expect(res.body.label).toBe("Mobile");
    });

    it("returns 400 when number is missing", async () => {
      const res = await api
        .post(`/api/employees/${empId}/phones`)
        .send({ label: "Home", isPrimary: false });
      expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid label", async () => {
      const res = await api
        .post(`/api/employees/${empId}/phones`)
        .send({ number: "07700900002", label: "Fax", isPrimary: false });
      expect(res.status).toBe(400);
    });

    it("demotes existing primary when new primary is added", async () => {
      const first = await api
        .post(`/api/employees/${empId}/phones`)
        .send({ number: "07700900010", label: "Mobile", isPrimary: true });
      expect(first.body.isPrimary).toBe(true);

      const second = await api
        .post(`/api/employees/${empId}/phones`)
        .send({ number: "07700900011", label: "Work", isPrimary: true });
      expect(second.body.isPrimary).toBe(true);

      const rows = await db
        .select()
        .from(employeePhonesTable)
        .where(eq(employeePhonesTable.employeeId, empId));
      const primaries = rows.filter((r) => r.isPrimary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0].id).toBe(second.body.id);
    });
  });

  // ── PATCH ───────────────────────────────────────────────────────────────

  describe("PATCH /api/employees/:id/phones/:phoneId", () => {
    it("updates number and label", async () => {
      const create = await api
        .post(`/api/employees/${empId}/phones`)
        .send({ number: "07700900020", label: "Mobile", isPrimary: false });
      const phoneId: number = create.body.id;

      const res = await api
        .patch(`/api/employees/${empId}/phones/${phoneId}`)
        .send({ number: "07700900099", label: "Home" });
      expect(res.status).toBe(200);
      expect(res.body.number).toBe("07700900099");
      expect(res.body.label).toBe("Home");
    });

    it("promotes to primary and demotes previous", async () => {
      const first = await api
        .post(`/api/employees/${empId}/phones`)
        .send({ number: "07700900030", label: "Mobile", isPrimary: true });
      const second = await api
        .post(`/api/employees/${empId}/phones`)
        .send({ number: "07700900031", label: "Work", isPrimary: false });

      await api
        .patch(`/api/employees/${empId}/phones/${second.body.id}`)
        .send({ isPrimary: true });

      const rows = await db
        .select()
        .from(employeePhonesTable)
        .where(eq(employeePhonesTable.employeeId, empId));
      const primaries = rows.filter((r) => r.isPrimary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0].id).toBe(second.body.id);
      const firstRow = rows.find((r) => r.id === first.body.id);
      expect(firstRow?.isPrimary).toBe(false);
    });

    it("returns 404 for unknown phone", async () => {
      const res = await api
        .patch(`/api/employees/${empId}/phones/999999`)
        .send({ number: "07700900000" });
      expect(res.status).toBe(404);
    });

    it("returns 404 when phoneId belongs to different employee", async () => {
      const otherEmpId = await createTestEmployee();
      try {
        const create = await api
          .post(`/api/employees/${otherEmpId}/phones`)
          .send({ number: "07700900040", label: "Mobile", isPrimary: false });
        const res = await api
          .patch(`/api/employees/${empId}/phones/${create.body.id}`)
          .send({ number: "07700900099" });
        expect(res.status).toBe(404);
      } finally {
        await cleanupEmployee(otherEmpId);
      }
    });
  });

  // ── DELETE ──────────────────────────────────────────────────────────────

  describe("DELETE /api/employees/:id/phones/:phoneId", () => {
    it("deletes a phone and returns 204", async () => {
      const create = await api
        .post(`/api/employees/${empId}/phones`)
        .send({ number: "07700900050", label: "Mobile", isPrimary: false });
      const phoneId: number = create.body.id;

      const del = await api.delete(`/api/employees/${empId}/phones/${phoneId}`);
      expect(del.status).toBe(204);

      const rows = await db
        .select()
        .from(employeePhonesTable)
        .where(eq(employeePhonesTable.employeeId, empId));
      expect(rows.find((r) => r.id === phoneId)).toBeUndefined();
    });

    it("returns 404 for unknown phone", async () => {
      const res = await api.delete(`/api/employees/${empId}/phones/999999`);
      expect(res.status).toBe(404);
    });
  });

  // ── Cascade delete ───────────────────────────────────────────────────────

  describe("cascade on employee delete", () => {
    it("removes phone rows when employee is deleted", async () => {
      const tempEmpId = await createTestEmployee();
      await db.insert(employeePhonesTable).values([
        { employeeId: tempEmpId, number: "07700900060", label: "Mobile", isPrimary: true },
        { employeeId: tempEmpId, number: "07700900061", label: "Work", isPrimary: false },
      ]);

      await cleanupEmployee(tempEmpId); // cascades

      const rows = await db
        .select()
        .from(employeePhonesTable)
        .where(eq(employeePhonesTable.employeeId, tempEmpId));
      expect(rows).toHaveLength(0);
    });
  });
});
