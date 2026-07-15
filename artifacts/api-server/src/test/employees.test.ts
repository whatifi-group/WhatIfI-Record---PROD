import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employees";
import {
  buildApp,
  cleanupEmployee,
  cleanupRole,
  cleanupUser,
  createTestEmployee,
  createTestRole,
  createTestUser,
} from "./helpers";

// ── Shared auth fixtures ──────────────────────────────────────────────────────
// Three roles/users created once for the whole suite:
//   sysadminUserId   — holds the "sysadmin" permission (can DELETE)
//   hrManagerUserId  — holds "edit_employees" only (can PATCH, cannot DELETE)
//   viewerUserId     — holds "view_employees" only (cannot PATCH or DELETE)
let sysadminRoleId: number;
let sysadminUserId: number;
let hrManagerRoleId: number;
let hrManagerUserId: number;
let viewerRoleId: number;
let viewerUserId: number;

beforeAll(async () => {
  sysadminRoleId = await createTestRole(["sysadmin"]);
  sysadminUserId = await createTestUser(sysadminRoleId);

  hrManagerRoleId = await createTestRole(["edit_employees"]);
  hrManagerUserId = await createTestUser(hrManagerRoleId);

  viewerRoleId = await createTestRole(["view_employees"]);
  viewerUserId = await createTestUser(viewerRoleId);
});

afterAll(async () => {
  await cleanupUser(sysadminUserId);
  await cleanupRole(sysadminRoleId);
  await cleanupUser(hrManagerUserId);
  await cleanupRole(hrManagerRoleId);
  await cleanupUser(viewerUserId);
  await cleanupRole(viewerRoleId);
});

// ── DELETE /employees/:id — permission enforcement ────────────────────────────

describe("DELETE /api/employees/:id — permission enforcement", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    // Guard: if the test deleted the employee this is a no-op.
    await cleanupEmployee(empId);
  });

  it("returns 401 when no session is present (unauthenticated)", async () => {
    const api = buildApp(router); // no userId → no session
    const res = await api.delete(`/api/employees/${empId}`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user holds edit_employees but not sysadmin", async () => {
    const api = buildApp(router, hrManagerUserId);
    const res = await api.delete(`/api/employees/${empId}`);
    expect(res.status).toBe(403);
  });

  it("returns 204 and removes the employee when the user is sysadmin", async () => {
    const api = buildApp(router, sysadminUserId);
    const res = await api.delete(`/api/employees/${empId}`);
    expect(res.status).toBe(204);

    // Confirm the record is gone
    const get = await buildApp(router).get(`/api/employees/${empId}`);
    expect(get.status).toBe(404);
  });

  it("returns 400 for a non-numeric employee id", async () => {
    const api = buildApp(router, sysadminUserId);
    const res = await api.delete("/api/employees/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 when the employee does not exist", async () => {
    const api = buildApp(router, sysadminUserId);
    const res = await api.delete("/api/employees/999999");
    expect(res.status).toBe(404);
  });
});

// ── PATCH /employees/:id — permission enforcement for leaver workflow ─────────

describe("PATCH /api/employees/:id — permission enforcement", () => {
  let empId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  it("returns 401 when no session is present (unauthenticated)", async () => {
    const api = buildApp(router); // no session
    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver", leaverReason: "resignation" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks edit_employees (view_employees only)", async () => {
    const api = buildApp(router, viewerUserId);
    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver", leaverReason: "resignation" });
    expect(res.status).toBe(403);
  });

  it("allows an edit_employees user to mark an employee as a leaver", async () => {
    const api = buildApp(router, hrManagerUserId);
    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver", leaverReason: "resignation" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("leaver");
  });
});

// ── PATCH /employees/:id — leaver business rules ──────────────────────────────

describe("PATCH /api/employees/:id — leaver status validation", () => {
  // api must be built lazily (inside beforeEach/test) because hrManagerUserId
  // is set in the outer beforeAll, which runs after describe-level code.
  let api: ReturnType<typeof buildApp>;
  let empId: number;

  beforeEach(async () => {
    api = buildApp(router, hrManagerUserId);
    empId = await createTestEmployee();
  });

  afterEach(async () => {
    await cleanupEmployee(empId);
  });

  it("returns 400 when status is 'leaver' but leaverReason is omitted", async () => {
    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/leaverReason/i);
  });

  it("returns 400 when status is 'leaver' and leaverReason is an empty string", async () => {
    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver", leaverReason: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when status is 'leaver' and leaverDate is explicitly null", async () => {
    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver", leaverReason: "resignation", leaverDate: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blank/i);
  });

  it("returns 400 when status is 'leaver' and leaverDate is more than 30 days in the future", async () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 31);
    const farFutureStr = farFuture.toISOString().slice(0, 10);

    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver", leaverReason: "resignation", leaverDate: farFutureStr });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/30 days/i);
  });

  it("returns 200 and auto-sets leaverDate to today when leaverReason is provided", async () => {
    const before = new Date().toISOString().slice(0, 10);

    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver", leaverReason: "resignation" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("leaver");
    expect(res.body.leaverReason).toBe("resignation");
    expect(res.body.leaverDate.slice(0, 10)).toBe(before);
  });

  it("returns 200 and respects an explicit leaverDate when provided", async () => {
    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver", leaverReason: "redundancy", leaverDate: "2024-03-31" });

    expect(res.status).toBe(200);
    expect(res.body.leaverDate.slice(0, 10)).toBe("2024-03-31");
  });

  it("returns 200 for a status change to 'active' with no leaverReason required", async () => {
    // First mark as leaver, then re-activate — no leaverReason needed for active
    await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver", leaverReason: "resignation" });

    const res = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "active" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
  });
});
