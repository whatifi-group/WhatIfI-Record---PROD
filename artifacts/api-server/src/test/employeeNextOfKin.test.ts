import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeeNextOfKin";
import {
  cleanupEmployee,
  createAuthedApp,
  createTestEmployee,
} from "./helpers";

let api: Awaited<ReturnType<typeof createAuthedApp>>["api"];
let cleanupAuth: () => Promise<void>;

// These routes each call requirePermission(...) themselves — routes/hr has no
// blanket gate — so the suite needs a user actually holding that permission.
beforeAll(async () => {
  ({ api, cleanup: cleanupAuth } = await createAuthedApp(router, ["edit_employees"]));
});

afterAll(async () => {
  await cleanupAuth();
});

describe("Employee Next of Kin", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  // ── GET list ─────────────────────────────────────────────────────────────

  describe("GET /api/employees/:id/next-of-kin", () => {
    it("returns empty array for a new employee", async () => {
      const res = await api.get(`/api/employees/${empId}/next-of-kin`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api.get("/api/employees/abc/next-of-kin");
      expect(res.status).toBe(400);
    });
  });

  // ── POST ─────────────────────────────────────────────────────────────────

  describe("POST /api/employees/:id/next-of-kin", () => {
    it("creates a next-of-kin record and returns 201", async () => {
      const res = await api
        .post(`/api/employees/${empId}/next-of-kin`)
        .send({
          name: "Jane Doe",
          relationship: "Spouse",
          email: "jane@example.com",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTypeOf("number");
      expect(res.body.name).toBe("Jane Doe");
      expect(res.body.relationship).toBe("Spouse");
      expect(res.body.employeeId).toBe(empId);
    });

    it("creates a record with only the required name field", async () => {
      const res = await api
        .post(`/api/employees/${empId}/next-of-kin`)
        .send({ name: "Parent" });

      expect(res.status).toBe(201);
      expect(res.body.phones).toEqual([]);
    });

    it("returns 400 when name is missing", async () => {
      const res = await api
        .post(`/api/employees/${empId}/next-of-kin`)
        .send({ relationship: "Parent" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api
        .post("/api/employees/abc/next-of-kin")
        .send({ name: "x" });
      expect(res.status).toBe(400);
    });
  });

  // ── PATCH ─────────────────────────────────────────────────────────────────

  describe("PATCH /api/employees/:id/next-of-kin/:kinId", () => {
    it("updates an existing next-of-kin record", async () => {
      const created = await api
        .post(`/api/employees/${empId}/next-of-kin`)
        .send({ name: "Original Name" });
      const kinId = created.body.id as number;

      const res = await api
        .patch(`/api/employees/${empId}/next-of-kin/${kinId}`)
        .send({ name: "Updated Name" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated Name");
      expect(res.body.phones).toBeDefined();
    });

    it("returns 404 when kinId does not exist", async () => {
      const res = await api
        .patch(`/api/employees/${empId}/next-of-kin/999999`)
        .send({ name: "x" });
      expect(res.status).toBe(404);
    });

    it("returns 404 when kin belongs to a different employee", async () => {
      const otherId = await createTestEmployee();
      const created = await api
        .post(`/api/employees/${otherId}/next-of-kin`)
        .send({ name: "Other Person" });
      const kinId = created.body.id as number;

      const res = await api
        .patch(`/api/employees/${empId}/next-of-kin/${kinId}`)
        .send({ name: "x" });
      expect(res.status).toBe(404);

      await cleanupEmployee(otherId);
    });
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  describe("DELETE /api/employees/:id/next-of-kin/:kinId", () => {
    it("deletes a record and returns 204", async () => {
      const created = await api
        .post(`/api/employees/${empId}/next-of-kin`)
        .send({ name: "To Delete" });
      const kinId = created.body.id as number;

      const del = await api.delete(
        `/api/employees/${empId}/next-of-kin/${kinId}`,
      );
      expect(del.status).toBe(204);

      const list = await api.get(`/api/employees/${empId}/next-of-kin`);
      expect(list.body).toHaveLength(0);
    });

    it("returns 404 when kinId does not exist", async () => {
      const res = await api.delete(
        `/api/employees/${empId}/next-of-kin/999999`,
      );
      expect(res.status).toBe(404);
    });
  });
});
