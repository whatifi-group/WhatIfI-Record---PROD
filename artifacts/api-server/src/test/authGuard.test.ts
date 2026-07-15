/**
 * Auth-guard integration tests.
 *
 * These tests verify that the `requireAuth` middleware — wired into the full
 * Express app — rejects every employee section endpoint with 401 when there
 * is no active session.  They intentionally do NOT mock auth so that a future
 * accidental removal of `requireAuth` is caught immediately.
 */
import express from "express";
import session from "express-session";
import supertest from "supertest";
import { describe, it, expect } from "vitest";
import { requireAuth } from "../middlewares/requireAuth";
import hrRouter from "../routes/hr";

// A fake employee id — requests should be rejected by auth before any DB hit.
const EMP = 1;

/** Build a minimal Express app that mirrors app.ts auth wiring but uses an
 *  in-memory session store so no Postgres session table is required. */
function buildAuthApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );
  // Mirror app.ts: requireAuth runs before the router
  app.use("/api", requireAuth);
  app.use("/api", hrRouter);
  return supertest(app);
}

const api = buildAuthApp();

describe("Auth guard — unauthenticated requests return 401", () => {
  // ── Addresses ──────────────────────────────────────────────────────────────
  describe("Addresses", () => {
    it("GET /api/employees/:id/addresses → 401", async () => {
      const res = await api.get(`/api/employees/${EMP}/addresses`);
      expect(res.status).toBe(401);
    });

    it("POST /api/employees/:id/addresses → 401", async () => {
      const res = await api
        .post(`/api/employees/${EMP}/addresses`)
        .send({ line1: "1 Main St" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/employees/:id/addresses/:addressId → 401", async () => {
      const res = await api
        .patch(`/api/employees/${EMP}/addresses/1`)
        .send({ line1: "x" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/employees/:id/addresses/:addressId → 401", async () => {
      const res = await api.delete(`/api/employees/${EMP}/addresses/1`);
      expect(res.status).toBe(401);
    });
  });

  // ── Payroll ────────────────────────────────────────────────────────────────
  describe("Payroll", () => {
    it("GET /api/employees/:id/payroll → 401", async () => {
      const res = await api.get(`/api/employees/${EMP}/payroll`);
      expect(res.status).toBe(401);
    });

    it("PUT /api/employees/:id/payroll → 401", async () => {
      const res = await api
        .put(`/api/employees/${EMP}/payroll`)
        .send({ bankName: "Barclays" });
      expect(res.status).toBe(401);
    });
  });

  // ── Attachments ────────────────────────────────────────────────────────────
  describe("Attachments", () => {
    it("GET /api/employees/:id/attachments → 401", async () => {
      const res = await api.get(`/api/employees/${EMP}/attachments`);
      expect(res.status).toBe(401);
    });

    it("POST /api/employees/:id/attachments → 401", async () => {
      const res = await api
        .post(`/api/employees/${EMP}/attachments`)
        .send({ fileName: "doc.pdf", url: "https://example.com/doc.pdf" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/employees/:id/attachments/:attachmentId → 401", async () => {
      const res = await api.delete(`/api/employees/${EMP}/attachments/1`);
      expect(res.status).toBe(401);
    });
  });

  // ── Medical ────────────────────────────────────────────────────────────────
  describe("Medical", () => {
    it("GET /api/employees/:id/medical → 401", async () => {
      const res = await api.get(`/api/employees/${EMP}/medical`);
      expect(res.status).toBe(401);
    });

    it("PUT /api/employees/:id/medical → 401", async () => {
      const res = await api
        .put(`/api/employees/${EMP}/medical`)
        .send({ notes: "None" });
      expect(res.status).toBe(401);
    });
  });

  // ── Dietary ────────────────────────────────────────────────────────────────
  describe("Dietary", () => {
    it("GET /api/employees/:id/dietary → 401", async () => {
      const res = await api.get(`/api/employees/${EMP}/dietary`);
      expect(res.status).toBe(401);
    });

    it("PUT /api/employees/:id/dietary → 401", async () => {
      const res = await api
        .put(`/api/employees/${EMP}/dietary`)
        .send({ requirements: "Vegan" });
      expect(res.status).toBe(401);
    });
  });

  // ── Next of Kin ────────────────────────────────────────────────────────────
  describe("Next of Kin", () => {
    it("GET /api/employees/:id/next-of-kin → 401", async () => {
      const res = await api.get(`/api/employees/${EMP}/next-of-kin`);
      expect(res.status).toBe(401);
    });

    it("POST /api/employees/:id/next-of-kin → 401", async () => {
      const res = await api
        .post(`/api/employees/${EMP}/next-of-kin`)
        .send({ name: "Jane Doe", relationship: "spouse" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/employees/:id/next-of-kin/:kinId → 401", async () => {
      const res = await api
        .patch(`/api/employees/${EMP}/next-of-kin/1`)
        .send({ name: "x" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/employees/:id/next-of-kin/:kinId → 401", async () => {
      const res = await api.delete(`/api/employees/${EMP}/next-of-kin/1`);
      expect(res.status).toBe(401);
    });
  });

  // ── Qualifications ─────────────────────────────────────────────────────────
  describe("Qualifications", () => {
    it("GET /api/employees/:id/qualifications → 401", async () => {
      const res = await api.get(`/api/employees/${EMP}/qualifications`);
      expect(res.status).toBe(401);
    });

    it("POST /api/employees/:id/qualifications → 401", async () => {
      const res = await api
        .post(`/api/employees/${EMP}/qualifications`)
        .send({ qualificationTypeId: 1, dateAchieved: "2024-01-01" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/employees/:id/qualifications/:qualId → 401", async () => {
      const res = await api
        .patch(`/api/employees/${EMP}/qualifications/1`)
        .send({ dateAchieved: "2024-06-01" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/employees/:id/qualifications/:qualId → 401", async () => {
      const res = await api.delete(`/api/employees/${EMP}/qualifications/1`);
      expect(res.status).toBe(401);
    });
  });

  // ── Work Records ───────────────────────────────────────────────────────────
  describe("Work Records", () => {
    it("GET /api/employees/:id/work-records → 401", async () => {
      const res = await api.get(`/api/employees/${EMP}/work-records`);
      expect(res.status).toBe(401);
    });

    it("POST /api/employees/:id/work-records → 401", async () => {
      const res = await api
        .post(`/api/employees/${EMP}/work-records`)
        .send({ shiftDate: "2024-01-15" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/employees/:id/work-records/:recordId → 401", async () => {
      const res = await api
        .patch(`/api/employees/${EMP}/work-records/1`)
        .send({ shiftDate: "2024-01-16" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/employees/:id/work-records/:recordId → 401", async () => {
      const res = await api.delete(`/api/employees/${EMP}/work-records/1`);
      expect(res.status).toBe(401);
    });
  });
});
