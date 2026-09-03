import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeeAddresses";
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

describe("Employee Addresses", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  // ── GET list ─────────────────────────────────────────────────────────────

  describe("GET /api/employees/:id/addresses", () => {
    it("returns empty array for an employee with no addresses", async () => {
      const res = await api.get(`/api/employees/${empId}/addresses`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns addresses ordered by createdAt after creation", async () => {
      await api
        .post(`/api/employees/${empId}/addresses`)
        .send({ line1: "1 First St" });
      await api
        .post(`/api/employees/${empId}/addresses`)
        .send({ line1: "2 Second St" });

      const res = await api.get(`/api/employees/${empId}/addresses`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api.get("/api/employees/abc/addresses");
      expect(res.status).toBe(400);
    });
  });

  // ── POST ─────────────────────────────────────────────────────────────────

  describe("POST /api/employees/:id/addresses", () => {
    it("creates an address and returns 201 with the new record", async () => {
      const res = await api
        .post(`/api/employees/${empId}/addresses`)
        .send({ line1: "123 Main St", addressType: "home", city: "London" });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTypeOf("number");
      expect(res.body.line1).toBe("123 Main St");
      expect(res.body.city).toBe("London");
      expect(res.body.employeeId).toBe(empId);
    });

    it("returns 400 when required field line1 is missing", async () => {
      const res = await api
        .post(`/api/employees/${empId}/addresses`)
        .send({ addressType: "home" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api
        .post("/api/employees/abc/addresses")
        .send({ line1: "x" });
      expect(res.status).toBe(400);
    });
  });

  // ── PATCH ─────────────────────────────────────────────────────────────────

  describe("PATCH /api/employees/:id/addresses/:addressId", () => {
    it("updates an existing address", async () => {
      const created = await api
        .post(`/api/employees/${empId}/addresses`)
        .send({ line1: "Old St" });
      const addressId = created.body.id as number;

      const res = await api
        .patch(`/api/employees/${empId}/addresses/${addressId}`)
        .send({ line1: "New St", city: "Manchester" });

      expect(res.status).toBe(200);
      expect(res.body.line1).toBe("New St");
      expect(res.body.city).toBe("Manchester");
    });

    it("returns 404 when address id does not exist", async () => {
      const res = await api
        .patch(`/api/employees/${empId}/addresses/999999`)
        .send({ line1: "x" });
      expect(res.status).toBe(404);
    });

    it("returns 404 when address belongs to a different employee", async () => {
      const otherId = await createTestEmployee();
      const created = await api
        .post(`/api/employees/${otherId}/addresses`)
        .send({ line1: "Other St" });
      const addressId = created.body.id as number;

      const res = await api
        .patch(`/api/employees/${empId}/addresses/${addressId}`)
        .send({ line1: "x" });
      expect(res.status).toBe(404);

      await cleanupEmployee(otherId);
    });
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  describe("DELETE /api/employees/:id/addresses/:addressId", () => {
    it("deletes an address and returns 204", async () => {
      const created = await api
        .post(`/api/employees/${empId}/addresses`)
        .send({ line1: "To Delete" });
      const addressId = created.body.id as number;

      const del = await api.delete(
        `/api/employees/${empId}/addresses/${addressId}`,
      );
      expect(del.status).toBe(204);

      // Confirm it is gone
      const list = await api.get(`/api/employees/${empId}/addresses`);
      expect(list.body).toHaveLength(0);
    });

    it("returns 404 when address id does not exist", async () => {
      const res = await api.delete(
        `/api/employees/${empId}/addresses/999999`,
      );
      expect(res.status).toBe(404);
    });
  });
});
