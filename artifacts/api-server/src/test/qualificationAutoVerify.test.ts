/**
 * Qualification auto-verify: POST /employees/:id/qualifications
 *
 * When an HR Admin (hr:access) or Sysadmin adds a qualification it is
 * immediately verified. All other callers get verificationStatus: "pending".
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import router from "../routes/hr/employeeQualifications";
import {
  buildApp,
  cleanupEmployee,
  cleanupQualType,
  cleanupRole,
  cleanupUser,
  createTestEmployee,
  createTestQualType,
  createTestRole,
  createTestUser,
} from "./helpers";

const PAYLOAD = { dateAchieved: "2024-06-01" } as const;

describe("POST /api/employees/:id/qualifications — auto-verify", () => {
  let empId: number;
  let qualTypeId: number;

  // Roles created per-suite so tests are fully isolated
  let hrRoleId: number;
  let sysRoleId: number;
  let basicRoleId: number;

  // Users
  let hrUserId: number;
  let sysUserId: number;
  let basicUserId: number;

  beforeEach(async () => {
    empId = await createTestEmployee();
    qualTypeId = await createTestQualType();

    hrRoleId = await createTestRole(["hr:access"]);
    sysRoleId = await createTestRole(["sysadmin"]);
    basicRoleId = await createTestRole([]);

    hrUserId = await createTestUser(hrRoleId);
    sysUserId = await createTestUser(sysRoleId);
    basicUserId = await createTestUser(basicRoleId);
  });

  afterEach(async () => {
    await cleanupEmployee(empId); // cascades to qualifications
    await cleanupQualType(qualTypeId);
    await cleanupUser(hrUserId);
    await cleanupUser(sysUserId);
    await cleanupUser(basicUserId);
    await cleanupRole(hrRoleId);
    await cleanupRole(sysRoleId);
    await cleanupRole(basicRoleId);
  });

  it("hr:access user → verificationStatus is verified with verifiedBy set", async () => {
    const api = buildApp(router, hrUserId);
    const res = await api
      .post(`/api/employees/${empId}/qualifications`)
      .send({ qualificationTypeId: qualTypeId, ...PAYLOAD });

    expect(res.status).toBe(201);
    expect(res.body.verificationStatus).toBe("verified");
    expect(res.body.verifiedBy).toBe(hrUserId);
    expect(res.body.verifiedAt).toBeTruthy();
    expect(typeof res.body.verifiedByName).toBe("string");
  });

  it("sysadmin user → verificationStatus is verified with verifiedBy set", async () => {
    const api = buildApp(router, sysUserId);
    const res = await api
      .post(`/api/employees/${empId}/qualifications`)
      .send({ qualificationTypeId: qualTypeId, ...PAYLOAD });

    expect(res.status).toBe(201);
    expect(res.body.verificationStatus).toBe("verified");
    expect(res.body.verifiedBy).toBe(sysUserId);
    expect(res.body.verifiedAt).toBeTruthy();
  });

  it("non-admin user → verificationStatus remains pending, verifiedBy is null", async () => {
    const api = buildApp(router, basicUserId);
    const res = await api
      .post(`/api/employees/${empId}/qualifications`)
      .send({ qualificationTypeId: qualTypeId, ...PAYLOAD });

    expect(res.status).toBe(201);
    expect(res.body.verificationStatus).toBe("pending");
    expect(res.body.verifiedBy).toBeNull();
    expect(res.body.verifiedAt).toBeNull();
    expect(res.body.verifiedByName).toBeNull();
  });

  it("unauthenticated caller (no session) → verificationStatus remains pending", async () => {
    // buildApp called without a userId — req.session will be undefined
    const api = buildApp(router);
    const res = await api
      .post(`/api/employees/${empId}/qualifications`)
      .send({ qualificationTypeId: qualTypeId, ...PAYLOAD });

    expect(res.status).toBe(201);
    expect(res.body.verificationStatus).toBe("pending");
    expect(res.body.verifiedBy).toBeNull();
  });
});
