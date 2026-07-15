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

  // ── GET /work-records — aggregated paginated endpoint ──────────────────────

  describe("GET /api/work-records — pagination", () => {
    it("returns a paginated envelope with rows, total, page, pageSize, totalPages", async () => {
      await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2025-01-10", shiftType: "regular" });

      const res = await api.get("/api/work-records");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("rows");
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("page");
      expect(res.body).toHaveProperty("pageSize");
      expect(res.body).toHaveProperty("totalPages");
      expect(Array.isArray(res.body.rows)).toBe(true);
    });

    it("defaults to page=1 and pageSize=50", async () => {
      const res = await api.get("/api/work-records");
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(50);
    });

    it("returns only pageSize records per page and correct total", async () => {
      // Insert 3 records
      await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2025-02-01", shiftType: "regular" });
      await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2025-02-02", shiftType: "regular" });
      await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2025-02-03", shiftType: "regular" });

      // Request page 1 with pageSize=2
      const res = await api.get("/api/work-records?pageSize=2&page=1");
      expect(res.status).toBe(200);
      expect(res.body.rows.length).toBeLessThanOrEqual(2);
      expect(res.body.pageSize).toBe(2);
      expect(res.body.page).toBe(1);
      // total reflects all matching records (at least the 3 we inserted)
      expect(res.body.total).toBeGreaterThanOrEqual(3);
      expect(res.body.totalPages).toBeGreaterThanOrEqual(2);
    });

    it("returns the second page of results with different rows", async () => {
      // Insert enough records so page 2 has content
      await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2025-03-01", shiftType: "regular" });
      await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2025-03-02", shiftType: "regular" });
      await api
        .post(`/api/employees/${empId}/work-records`)
        .send({ shiftDate: "2025-03-03", shiftType: "regular" });

      const page1 = await api.get("/api/work-records?pageSize=2&page=1");
      const page2 = await api.get("/api/work-records?pageSize=2&page=2");

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page2.body.page).toBe(2);

      // The rows on page 2 should not overlap with page 1
      const ids1 = page1.body.rows.map((r: { id: number }) => r.id);
      const ids2 = page2.body.rows.map((r: { id: number }) => r.id);
      const overlap = ids1.filter((id: number) => ids2.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it("returns 400 for an invalid page value", async () => {
      const res = await api.get("/api/work-records?page=0");
      expect(res.status).toBe(400);
    });

    it("returns 400 when pageSize exceeds the maximum of 200", async () => {
      const res = await api.get("/api/work-records?pageSize=201");
      expect(res.status).toBe(400);
    });
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
