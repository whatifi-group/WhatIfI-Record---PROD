import { afterEach, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeeAttachments";
import { buildApp, cleanupEmployee, createTestEmployee } from "./helpers";

const api = buildApp(router);

describe("Employee Attachments", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  // ── GET list ─────────────────────────────────────────────────────────────

  describe("GET /api/employees/:id/attachments", () => {
    it("returns empty array for a new employee", async () => {
      const res = await api.get(`/api/employees/${empId}/attachments`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api.get("/api/employees/abc/attachments");
      expect(res.status).toBe(400);
    });
  });

  // ── POST ─────────────────────────────────────────────────────────────────

  describe("POST /api/employees/:id/attachments", () => {
    it("creates an attachment and returns 201", async () => {
      const res = await api
        .post(`/api/employees/${empId}/attachments`)
        .send({
          fileName: "cv.pdf",
          fileUrl: "https://storage.example.com/cv.pdf",
          fileType: "application/pdf",
          fileSizeBytes: 102400,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTypeOf("number");
      expect(res.body.fileName).toBe("cv.pdf");
      expect(res.body.employeeId).toBe(empId);
    });

    it("creates an attachment without optional fields", async () => {
      const res = await api
        .post(`/api/employees/${empId}/attachments`)
        .send({ fileName: "doc.txt", fileUrl: "https://storage.example.com/doc.txt" });

      expect(res.status).toBe(201);
      expect(res.body.fileType).toBeNull();
    });

    it("returns 400 when fileName is missing", async () => {
      const res = await api
        .post(`/api/employees/${empId}/attachments`)
        .send({ fileUrl: "https://storage.example.com/cv.pdf" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when fileUrl is missing", async () => {
      const res = await api
        .post(`/api/employees/${empId}/attachments`)
        .send({ fileName: "cv.pdf" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-numeric employee id", async () => {
      const res = await api
        .post("/api/employees/abc/attachments")
        .send({ fileName: "x", fileUrl: "https://x" });
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  describe("DELETE /api/employees/:id/attachments/:attachmentId", () => {
    it("deletes an attachment and returns 204", async () => {
      const created = await api
        .post(`/api/employees/${empId}/attachments`)
        .send({ fileName: "to-delete.pdf", fileUrl: "https://storage.example.com/x" });
      const attachmentId = created.body.id as number;

      const del = await api.delete(
        `/api/employees/${empId}/attachments/${attachmentId}`,
      );
      expect(del.status).toBe(204);

      const list = await api.get(`/api/employees/${empId}/attachments`);
      expect(list.body).toHaveLength(0);
    });

    it("returns 404 when attachment does not exist", async () => {
      const res = await api.delete(
        `/api/employees/${empId}/attachments/999999`,
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 when attachment belongs to a different employee", async () => {
      const otherId = await createTestEmployee();
      const created = await api
        .post(`/api/employees/${otherId}/attachments`)
        .send({ fileName: "other.pdf", fileUrl: "https://storage.example.com/other" });
      const attachmentId = created.body.id as number;

      const res = await api.delete(
        `/api/employees/${empId}/attachments/${attachmentId}`,
      );
      expect(res.status).toBe(404);

      await cleanupEmployee(otherId);
    });
  });
});
