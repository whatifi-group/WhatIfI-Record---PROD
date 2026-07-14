import { afterEach, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeeMedical";
import { buildApp, cleanupEmployee, createTestEmployee } from "./helpers";

const api = buildApp(router);

describe("Employee Medical", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  // ── GET ──────────────────────────────────────────────────────────────────

  describe("GET /api/employees/:id/medical", () => {
    it("returns empty selections and null notes for a new employee", async () => {
      const res = await api.get(`/api/employees/${empId}/medical`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ selections: [], notes: null });
    });

    it("returns saved selections and notes after a PUT", async () => {
      await api
        .put(`/api/employees/${empId}/medical`)
        .send({ selections: ["diabetes", "asthma"], notes: "Uses inhaler" });

      const res = await api.get(`/api/employees/${empId}/medical`);
      expect(res.status).toBe(200);
      expect(res.body.selections).toEqual(
        expect.arrayContaining(["diabetes", "asthma"]),
      );
      expect(res.body.notes).toBe("Uses inhaler");
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api.get("/api/employees/abc/medical");
      expect(res.status).toBe(400);
    });
  });

  // ── PUT ──────────────────────────────────────────────────────────────────

  describe("PUT /api/employees/:id/medical", () => {
    it("saves selections and notes and returns them", async () => {
      const res = await api
        .put(`/api/employees/${empId}/medical`)
        .send({ selections: ["epilepsy"], notes: "Takes medication daily" });

      expect(res.status).toBe(200);
      expect(res.body.selections).toEqual(["epilepsy"]);
      expect(res.body.notes).toBe("Takes medication daily");
    });

    it("replaces selections on a second PUT", async () => {
      await api
        .put(`/api/employees/${empId}/medical`)
        .send({ selections: ["diabetes", "asthma"] });

      const res = await api
        .put(`/api/employees/${empId}/medical`)
        .send({ selections: ["epilepsy"] });

      expect(res.status).toBe(200);
      expect(res.body.selections).toEqual(["epilepsy"]);
    });

    it("clears selections when an empty array is sent", async () => {
      await api
        .put(`/api/employees/${empId}/medical`)
        .send({ selections: ["asthma"] });

      const res = await api
        .put(`/api/employees/${empId}/medical`)
        .send({ selections: [] });

      expect(res.status).toBe(200);
      expect(res.body.selections).toEqual([]);
    });

    it("returns 400 when selections is not an array", async () => {
      const res = await api
        .put(`/api/employees/${empId}/medical`)
        .send({ selections: "not-an-array" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api
        .put("/api/employees/abc/medical")
        .send({ selections: [] });
      expect(res.status).toBe(400);
    });
  });
});
