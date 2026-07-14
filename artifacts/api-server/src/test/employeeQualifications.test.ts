import { afterEach, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeeQualifications";
import { buildApp, cleanupEmployee, createTestEmployee } from "./helpers";

const api = buildApp(router);

describe("Employee Qualifications", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
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
        .send({
          title: "BSc Computer Science",
          institution: "University of London",
          yearObtained: 2015,
          notes: "First class honours",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTypeOf("number");
      expect(res.body.title).toBe("BSc Computer Science");
      expect(res.body.institution).toBe("University of London");
      expect(res.body.yearObtained).toBe(2015);
      expect(res.body.employeeId).toBe(empId);
    });

    it("creates a qualification with only the required title field", async () => {
      const res = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ title: "GCSE Maths" });

      expect(res.status).toBe(201);
      expect(res.body.institution).toBeNull();
    });

    it("returns 400 when title is missing", async () => {
      const res = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ institution: "Some College" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api
        .post("/api/employees/abc/qualifications")
        .send({ title: "x" });
      expect(res.status).toBe(400);
    });
  });

  // ── PATCH ─────────────────────────────────────────────────────────────────

  describe("PATCH /api/employees/:id/qualifications/:qualId", () => {
    it("updates an existing qualification", async () => {
      const created = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ title: "Old Title" });
      const qualId = created.body.id as number;

      const res = await api
        .patch(`/api/employees/${empId}/qualifications/${qualId}`)
        .send({ title: "New Title", yearObtained: 2020 });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("New Title");
      expect(res.body.yearObtained).toBe(2020);
    });

    it("returns 404 when qualId does not exist", async () => {
      const res = await api
        .patch(`/api/employees/${empId}/qualifications/999999`)
        .send({ title: "x" });
      expect(res.status).toBe(404);
    });

    it("returns 404 when qualification belongs to a different employee", async () => {
      const otherId = await createTestEmployee();
      const created = await api
        .post(`/api/employees/${otherId}/qualifications`)
        .send({ title: "Other Qual" });
      const qualId = created.body.id as number;

      const res = await api
        .patch(`/api/employees/${empId}/qualifications/${qualId}`)
        .send({ title: "x" });
      expect(res.status).toBe(404);

      await cleanupEmployee(otherId);
    });
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  describe("DELETE /api/employees/:id/qualifications/:qualId", () => {
    it("deletes a qualification and returns 204", async () => {
      const created = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ title: "To Delete" });
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
});
