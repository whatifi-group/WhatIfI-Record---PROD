import { afterEach, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeeWorkRecords";
import { buildApp, cleanupEmployee, createTestEmployee } from "./helpers";

const api = buildApp(router);

describe("Employee Work Records", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  // ── GET list ─────────────────────────────────────────────────────────────

  describe("GET /api/employees/:id/work-records", () => {
    it("returns empty array for a new employee", async () => {
      const res = await api.get(`/api/employees/${empId}/work-records`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns work records ordered by shiftDate", async () => {
      await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2024-03-01" });
      await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2024-01-15" });

      const res = await api.get(`/api/employees/${empId}/work-records`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].shiftDate).toBe("2024-01-15");
      expect(res.body[1].shiftDate).toBe("2024-03-01");
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api.get("/api/employees/abc/work-records");
      expect(res.status).toBe(400);
    });
  });

  // ── POST ─────────────────────────────────────────────────────────────────

  describe("POST /api/employees/:id/work-records", () => {
    it("creates a work record and returns 201 with all fields", async () => {
      const res = await api
        .post(`/api/employees/${empId}/work-records`)
        .send({
          shiftDate: "2024-06-15",
          startTime: "09:00",
          endTime: "17:00",
          hoursWorked: 8,
          shiftType: "regular",
          notes: "Bank holiday cover",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTypeOf("number");
      expect(res.body.shiftDate).toBe("2024-06-15");
      expect(res.body.startTime).toBe("09:00");
      expect(res.body.hoursWorked).toBe(8);
      expect(res.body.employeeId).toBe(empId);
    });

    it("creates a record with decimal hoursWorked", async () => {
      const res = await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2024-06-16", hoursWorked: 7.5 });

      expect(res.status).toBe(201);
      expect(res.body.hoursWorked).toBe(7.5);
    });

    it("creates a record with only the required shiftDate field", async () => {
      const res = await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2024-06-17" });

      expect(res.status).toBe(201);
      expect(res.body.hoursWorked).toBeNull();
      expect(res.body.startTime).toBeNull();
    });

    it("returns 400 when shiftDate is missing", async () => {
      const res = await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ hoursWorked: 8 });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api
        .post("/api/employees/abc/work-records")
        .send({ shiftDate: "2024-01-01" });
      expect(res.status).toBe(400);
    });
  });

  // ── PATCH ─────────────────────────────────────────────────────────────────

  describe("PATCH /api/employees/:id/work-records/:recordId", () => {
    it("updates an existing work record", async () => {
      const created = await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2024-07-01", hoursWorked: 8 });
      const recordId = created.body.id as number;

      const res = await api
        .patch(`/api/employees/${empId}/work-records/${recordId}`)
        .send({ hoursWorked: 6, notes: "Left early" });

      expect(res.status).toBe(200);
      expect(res.body.hoursWorked).toBe(6);
      expect(res.body.notes).toBe("Left early");
    });

    it("can clear hoursWorked by setting it to null", async () => {
      const created = await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2024-07-02", hoursWorked: 8 });
      const recordId = created.body.id as number;

      const res = await api
        .patch(`/api/employees/${empId}/work-records/${recordId}`)
        .send({ hoursWorked: null });

      expect(res.status).toBe(200);
      expect(res.body.hoursWorked).toBeNull();
    });

    it("returns 404 when recordId does not exist", async () => {
      const res = await api
        .patch(`/api/employees/${empId}/work-records/999999`)
        .send({ notes: "x" });
      expect(res.status).toBe(404);
    });

    it("returns 404 when record belongs to a different employee", async () => {
      const otherId = await createTestEmployee();
      const created = await api
        .post(`/api/employees/${otherId}/work-records`)
        .send({ shiftDate: "2024-07-03" });
      const recordId = created.body.id as number;

      const res = await api
        .patch(`/api/employees/${empId}/work-records/${recordId}`)
        .send({ notes: "x" });
      expect(res.status).toBe(404);

      await cleanupEmployee(otherId);
    });
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  describe("DELETE /api/employees/:id/work-records/:recordId", () => {
    it("deletes a work record and returns 204", async () => {
      const created = await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2024-08-01" });
      const recordId = created.body.id as number;

      const del = await api.delete(
        `/api/employees/${empId}/work-records/${recordId}`,
      );
      expect(del.status).toBe(204);

      const list = await api.get(`/api/employees/${empId}/work-records`);
      expect(list.body).toHaveLength(0);
    });

    it("returns 404 when recordId does not exist", async () => {
      const res = await api.delete(
        `/api/employees/${empId}/work-records/999999`,
      );
      expect(res.status).toBe(404);
    });
  });
});
