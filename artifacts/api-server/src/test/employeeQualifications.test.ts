import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import router, { objectStorageService } from "../routes/hr/employeeQualifications";
import {
  buildApp,
  cleanupEmployee,
  cleanupQualType,
  createTestEmployee,
  createTestQualification,
  createTestQualType,
} from "./helpers";
import { ObjectNotFoundError } from "../lib/objectStorage";

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

  // ── Certificate POST — object metadata verification ───────────────────────

  describe("POST /api/employees/:id/qualifications/:qualId/certificates", () => {
    let qualId: number;

    beforeEach(async () => {
      const qualRes = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: qtId, dateAchieved: "2023-06-01" });
      qualId = qualRes.body.id as number;

      // Default: object exists with compliant metadata (100 KB PDF).
      vi.spyOn(objectStorageService, "getObjectEntityMetadata").mockResolvedValue({
        size: 1024 * 100,
        contentType: "application/pdf",
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("creates a certificate and returns 201 for a valid /objects/ path", async () => {
      const res = await api
        .post(`/api/employees/${empId}/qualifications/${qualId}/certificates`)
        .send({ fileName: "cert.pdf", fileUrl: "/objects/uploads/uuid-ok", mimeType: "application/pdf" });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTypeOf("number");
    });

    it("skips metadata check and creates 201 for a legacy https:// URL", async () => {
      const metaSpy = vi.spyOn(objectStorageService, "getObjectEntityMetadata");
      const res = await api
        .post(`/api/employees/${empId}/qualifications/${qualId}/certificates`)
        .send({ fileName: "legacy.pdf", fileUrl: "https://example.com/cert.pdf" });
      expect(res.status).toBe(201);
      expect(metaSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when the object exceeds 20 MB even though the presigned-URL request claimed a smaller size", async () => {
      vi.spyOn(objectStorageService, "getObjectEntityMetadata").mockResolvedValue({
        size: 25 * 1024 * 1024, // 25 MB — bypassed the request-time check
        contentType: "application/pdf",
      });
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(objectStorageService, "getObjectEntityFile").mockResolvedValue(
        { delete: mockDelete } as never,
      );

      const res = await api
        .post(`/api/employees/${empId}/qualifications/${qualId}/certificates`)
        .send({ fileName: "huge.pdf", fileUrl: "/objects/uploads/oversized-uuid" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/20 MB/);
      expect(mockDelete).toHaveBeenCalledTimes(1); // non-compliant object cleaned up
    });

    it("returns 400 when the actual content-type is disallowed even though application/pdf was declared at request time", async () => {
      vi.spyOn(objectStorageService, "getObjectEntityMetadata").mockResolvedValue({
        size: 512,
        contentType: "video/mp4", // bypassed the request-time check
      });
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(objectStorageService, "getObjectEntityFile").mockResolvedValue(
        { delete: mockDelete } as never,
      );

      const res = await api
        .post(`/api/employees/${empId}/qualifications/${qualId}/certificates`)
        .send({ fileName: "trick.pdf", fileUrl: "/objects/uploads/wrong-type-uuid" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/video\/mp4/);
      expect(res.body.error).toMatch(/not allowed/);
      expect(mockDelete).toHaveBeenCalledTimes(1); // non-compliant object cleaned up
    });

    it("returns 400 when the object does not exist in storage", async () => {
      vi.spyOn(objectStorageService, "getObjectEntityMetadata").mockRejectedValue(
        new ObjectNotFoundError(),
      );

      const res = await api
        .post(`/api/employees/${empId}/qualifications/${qualId}/certificates`)
        .send({ fileName: "ghost.pdf", fileUrl: "/objects/uploads/nonexistent-uuid" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/could not be found/);
    });

    it("does not persist a certificate record when metadata validation fails", async () => {
      vi.spyOn(objectStorageService, "getObjectEntityMetadata").mockResolvedValue({
        size: 30 * 1024 * 1024,
        contentType: "application/pdf",
      });
      vi.spyOn(objectStorageService, "getObjectEntityFile").mockResolvedValue(
        { delete: vi.fn().mockResolvedValue(undefined) } as never,
      );

      await api
        .post(`/api/employees/${empId}/qualifications/${qualId}/certificates`)
        .send({ fileName: "oversized.pdf", fileUrl: "/objects/uploads/oversized2-uuid" });

      const list = await api.get(
        `/api/employees/${empId}/qualifications/${qualId}/certificates`,
      );
      expect(list.body).toHaveLength(0);
    });
  });

  // ── Certificate DELETE — storage cleanup ─────────────────────────────────

  describe("DELETE /api/employees/:id/qualifications/:qualId/certificates/:certId", () => {
    // Stub metadata check so certificate POST succeeds without hitting GCS.
    beforeEach(() => {
      vi.spyOn(objectStorageService, "getObjectEntityMetadata").mockResolvedValue({
        size: 1024 * 50,
        contentType: "application/pdf",
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("deletes the GCS object when fileUrl is an /objects/ path", async () => {
      const qualRes = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: qtId, dateAchieved: "2023-01-01" });
      const qualId = qualRes.body.id as number;

      const certRes = await api
        .post(`/api/employees/${empId}/qualifications/${qualId}/certificates`)
        .send({
          fileName: "cert.pdf",
          fileUrl: "/objects/uploads/test-uuid-1234",
          mimeType: "application/pdf",
        });
      expect(certRes.status).toBe(201);
      const certId = certRes.body.id as number;

      // Mock the storage service to capture calls
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockFile = { delete: mockDelete } as never;
      const getFileSpy = vi
        .spyOn(objectStorageService, "getObjectEntityFile")
        .mockResolvedValue(mockFile);

      const del = await api.delete(
        `/api/employees/${empId}/qualifications/${qualId}/certificates/${certId}`,
      );

      expect(del.status).toBe(204);
      expect(getFileSpy).toHaveBeenCalledWith("/objects/uploads/test-uuid-1234");
      expect(mockDelete).toHaveBeenCalledTimes(1);

      getFileSpy.mockRestore();
    });

    it("skips storage deletion and still returns 204 when fileUrl is a legacy https:// URL", async () => {
      const qualRes = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: qtId, dateAchieved: "2023-02-01" });
      const qualId = qualRes.body.id as number;

      const certRes = await api
        .post(`/api/employees/${empId}/qualifications/${qualId}/certificates`)
        .send({
          fileName: "legacy.pdf",
          fileUrl: "https://example.com/files/legacy.pdf",
          mimeType: "application/pdf",
        });
      expect(certRes.status).toBe(201);
      const certId = certRes.body.id as number;

      const getFileSpy = vi.spyOn(objectStorageService, "getObjectEntityFile");

      const del = await api.delete(
        `/api/employees/${empId}/qualifications/${qualId}/certificates/${certId}`,
      );

      expect(del.status).toBe(204);
      expect(getFileSpy).not.toHaveBeenCalled();

      getFileSpy.mockRestore();
    });

    it("still returns 204 when the GCS object is already gone (ObjectNotFoundError)", async () => {
      const qualRes = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: qtId, dateAchieved: "2023-03-01" });
      const qualId = qualRes.body.id as number;

      const certRes = await api
        .post(`/api/employees/${empId}/qualifications/${qualId}/certificates`)
        .send({
          fileName: "missing.pdf",
          fileUrl: "/objects/uploads/already-gone-uuid",
          mimeType: "application/pdf",
        });
      expect(certRes.status).toBe(201);
      const certId = certRes.body.id as number;

      const getFileSpy = vi
        .spyOn(objectStorageService, "getObjectEntityFile")
        .mockRejectedValue(new ObjectNotFoundError());

      const del = await api.delete(
        `/api/employees/${empId}/qualifications/${qualId}/certificates/${certId}`,
      );

      expect(del.status).toBe(204);

      getFileSpy.mockRestore();
    });

    it("returns 404 when the certificate does not exist", async () => {
      const qualRes = await api
        .post(`/api/employees/${empId}/qualifications`)
        .send({ qualificationTypeId: qtId, dateAchieved: "2023-04-01" });
      const qualId = qualRes.body.id as number;

      const res = await api.delete(
        `/api/employees/${empId}/qualifications/${qualId}/certificates/999999`,
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
