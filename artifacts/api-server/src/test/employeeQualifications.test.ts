import { afterEach, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeeQualifications";
import {
  buildApp,
  cleanupEmployee,
  cleanupQualType,
  createTestEmployee,
  createTestQualification,
  createTestQualType,
} from "./helpers";

const api = buildApp(router);

describe("Employee Qualifications", () => {
  let empId: number;
  let qtId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
    qtId = await createTestQualType();
  });

  // Clean up employee first (cascades qual records), then qual type (FK safe).
  afterEach(async () => {
    await cleanupEmployee(empId);
    await cleanupQualType(qtId);
  });

  // ── GET list ─────────────────────────────────────────────────────────────

  describe("GET /api/employees/:id/qualifications", () => {
    it("returns empty array for a new employee", async () => {
      const res = await api.get(`/api/employees/${empId}/qualifications`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api.get("/api/employees/abc/qualifications");
      expect(res.status).toBe(400);
    });
  });

  // ── POST ─────────────────────────────────────────────────────────────────

  describe("POST /api/employees/:id/qualifications", () => {
    it("creates a qualification and returns 201", async () => {
      const res = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: qtId, dateAchieved: "2023-06-01", notes: "Passed first time" });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTypeOf("number");
      expect(res.body.qualificationTypeId).toBe(qtId);
      expect(res.body.dateAchieved).toBe("2023-06-01");
      expect(res.body.employeeId).toBe(empId);
    });

    it("creates a qualification with only the required fields", async () => {
      const res = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: qtId, dateAchieved: "2022-01-15" });

      expect(res.status).toBe(201);
      expect(res.body.notes).toBeNull();
    });

    it("returns 400 when qualificationTypeId is missing", async () => {
      const res = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ dateAchieved: "2022-01-15" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when dateAchieved is missing", async () => {
      const res = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: qtId });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api
        .post("/api/employees/abc/qualifications")
        .send({ qualificationTypeId: qtId, dateAchieved: "2022-01-15" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when the qualification type does not exist", async () => {
      const res = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: 999999, dateAchieved: "2022-01-15" });
      expect(res.status).toBe(400);
    });
  });

  // ── PATCH ─────────────────────────────────────────────────────────────────

  describe("PATCH /api/employees/:id/qualifications/:qualId", () => {
    it("updates the date achieved and notes on an existing qualification", async () => {
      const created = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: qtId, dateAchieved: "2021-03-01" });
      const qualId = created.body.id as number;

      const res = await api
        .patch(`/api/employees/${empId}/qualifications/${qualId}`)
        .send({ dateAchieved: "2021-06-01", notes: "Updated note" });

      expect(res.status).toBe(200);
      expect(res.body.dateAchieved).toBe("2021-06-01");
      expect(res.body.notes).toBe("Updated note");
    });

    it("returns 404 when qualId does not exist", async () => {
      const res = await api
        .patch(`/api/employees/${empId}/qualifications/999999`)
        .send({ notes: "x" });
      expect(res.status).toBe(404);
    });

    it("returns 404 when qualification belongs to a different employee", async () => {
      const otherId = await createTestEmployee();
      // Insert directly so we have a valid record without going through the API
      const qualId = await createTestQualification(otherId, qtId, null);

      const res = await api
        .patch(`/api/employees/${empId}/qualifications/${qualId}`)
        .send({ notes: "x" });
      expect(res.status).toBe(404);

      await cleanupEmployee(otherId);
    });
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  describe("DELETE /api/employees/:id/qualifications/:qualId", () => {
    it("deletes a qualification and returns 204", async () => {
      const created = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: qtId, dateAchieved: "2020-05-01" });
      const qualId = created.body.id as number;

      const del = await api.delete(
        `/api/employees/${empId}/qualifications/${qualId}`,
      );
      expect(del.status).toBe(204);

      const list = await api.get(`/api/employees/${empId}/qualifications`);
      expect(list.body).toHaveLength(0);
    });

    it("returns 404 when qualId does not exist", async () => {
      const res = await api.delete(
        `/api/employees/${empId}/qualifications/999999`,
      );
      expect(res.status).toBe(404);
    });
  });

  // ── GET /qualifications/expiring ──────────────────────────────────────────

  describe("GET /api/qualifications/expiring", () => {
    it("withinDays=0 returns only expired records and excludes future expiries", async () => {
      const past = new Date();
      past.setDate(past.getDate() - 5);
      const expiredId = await createTestQualification(
        empId,
        qtId,
        past.toISOString().split("T")[0],
      );

      const future = new Date();
      future.setDate(future.getDate() + 20);
      const futureId = await createTestQualification(
        empId,
        qtId,
        future.toISOString().split("T")[0],
      );

      const res = await api.get("/api/qualifications/expiring?withinDays=0");
      expect(res.status).toBe(200);
      const ids: number[] = res.body.map((r: { id: number }) => r.id);
      expect(ids).toContain(expiredId);
      expect(ids).not.toContain(futureId);
    });

    it("withinDays=30 includes records expiring within 30 days but excludes later ones", async () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 20);
      const soonId = await createTestQualification(
        empId,
        qtId,
        soon.toISOString().split("T")[0],
      );

      const later = new Date();
      later.setDate(later.getDate() + 60);
      const laterId = await createTestQualification(
        empId,
        qtId,
        later.toISOString().split("T")[0],
      );

      const res = await api.get("/api/qualifications/expiring?withinDays=30");
      expect(res.status).toBe(200);
      const ids: number[] = res.body.map((r: { id: number }) => r.id);
      expect(ids).toContain(soonId);
      expect(ids).not.toContain(laterId);
    });

    it("excludes qualifications that have no expiry date", async () => {
      const noExpiryId = await createTestQualification(empId, qtId, null);

      const res = await api.get("/api/qualifications/expiring?withinDays=90");
      expect(res.status).toBe(200);
      const ids: number[] = res.body.map((r: { id: number }) => r.id);
      expect(ids).not.toContain(noExpiryId);
    });

    it("response includes employee name and daysUntilExpiry fields", async () => {
      const past = new Date();
      past.setDate(past.getDate() - 3);
      await createTestQualification(empId, qtId, past.toISOString().split("T")[0]);

      const res = await api.get("/api/qualifications/expiring?withinDays=0");
      expect(res.status).toBe(200);
      const record = res.body.find((r: { employeeId: number }) => r.employeeId === empId);
      expect(record).toBeDefined();
      expect(record.employeeFirstName).toBe("Test");
      expect(record.employeeLastName).toBe("Employee");
      expect(record.daysUntilExpiry).toBeLessThan(0);
    });
  });
});
