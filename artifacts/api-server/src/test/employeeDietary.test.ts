import { afterEach, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeeDietary";
import { buildApp, cleanupEmployee, createTestEmployee } from "./helpers";

const api = buildApp(router);

describe("Employee Dietary", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  // ── GET ──────────────────────────────────────────────────────────────────

  describe("GET /api/employees/:id/dietary", () => {
    it("returns empty selections and null notes for a new employee", async () => {
      const res = await api.get(`/api/employees/${empId}/dietary`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ selections: [], notes: null });
    });

    it("returns saved data after a PUT", async () => {
      await api
        .put(`/api/employees/${empId}/dietary`)
        .send({ selections: ["vegan", "gluten-free"], notes: "Severe gluten allergy" });

      const res = await api.get(`/api/employees/${empId}/dietary`);
      expect(res.status).toBe(200);
      expect(res.body.selections).toEqual(
        expect.arrayContaining(["vegan", "gluten-free"]),
      );
      expect(res.body.notes).toBe("Severe gluten allergy");
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api.get("/api/employees/abc/dietary");
      expect(res.status).toBe(400);
    });
  });

  // ── PUT ──────────────────────────────────────────────────────────────────

  describe("PUT /api/employees/:id/dietary", () => {
    it("saves selections and notes and returns them", async () => {
      const res = await api
        .put(`/api/employees/${empId}/dietary`)
        .send({ selections: ["vegetarian"], notes: "No meat at all" });

      expect(res.status).toBe(200);
      expect(res.body.selections).toEqual(["vegetarian"]);
      expect(res.body.notes).toBe("No meat at all");
    });

    it("replaces selections on a second PUT", async () => {
      await api
        .put(`/api/employees/${empId}/dietary`)
        .send({ selections: ["vegan", "gluten-free"] });

      const res = await api
        .put(`/api/employees/${empId}/dietary`)
        .send({ selections: ["halal"] });

      expect(res.status).toBe(200);
      expect(res.body.selections).toEqual(["halal"]);
    });

    it("clears selections when an empty array is sent", async () => {
      await api
        .put(`/api/employees/${empId}/dietary`)
        .send({ selections: ["kosher"] });

      const res = await api
        .put(`/api/employees/${empId}/dietary`)
        .send({ selections: [] });

      expect(res.status).toBe(200);
      expect(res.body.selections).toEqual([]);
    });

    it("returns 400 when selections is not an array", async () => {
      const res = await api
        .put(`/api/employees/${empId}/dietary`)
        .send({ selections: "vegan" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api
        .put("/api/employees/abc/dietary")
        .send({ selections: [] });
      expect(res.status).toBe(400);
    });
  });
});
