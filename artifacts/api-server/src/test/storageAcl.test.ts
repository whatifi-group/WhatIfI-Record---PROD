/**
 * Storage ACL — access control tests for GET /storage/objects/*.
 *
 * Confirms that the private object download endpoint:
 *  (a) Returns 401 for unauthenticated callers (no session).
 *  (b) Returns 403 for authenticated callers with no relevant permission.
 *  (c) Returns 200 for callers with view_payroll.
 *  (d) Returns 200 for sysadmin callers.
 *  (e) Returns 200 for callers with hr:access (HR managers reviewing
 *      qualification certificates in the onboarding queue).
 *  (f) Returns 403 for callers with only view_employee_directory —
 *      this endpoint serves the full private namespace and cannot enforce
 *      per-object ownership; self-service users must not have blanket access.
 *
 * GCS storage interactions are mocked so no live bucket is required.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Mock @google-cloud/storage before any module that imports it is loaded.
// This prevents the ObjectStorageService constructor from attempting a real
// GCS credential exchange at import time.
vi.mock("@google-cloud/storage", () => {
  function MockStorage(this: Record<string, unknown>) {
    this.bucket = vi.fn().mockReturnValue({});
  }
  return {
    Storage: MockStorage,
    File: vi.fn(),
  };
});

import storageRouter, { objectStorageService } from "../routes/storage";
import {
  buildApp,
  createTestRole,
  createTestUser,
  cleanupRole,
  cleanupUser,
} from "./helpers";

// ── Mock the GCS methods that the route calls after passing auth checks ────────

// Returns a fake File-like object; actual GCS metadata is never fetched.
const mockFile = {} as Awaited<ReturnType<typeof objectStorageService.getObjectEntityFile>>;

vi.spyOn(objectStorageService, "getObjectEntityFile").mockResolvedValue(mockFile);
vi.spyOn(objectStorageService, "downloadObject").mockResolvedValue(
  // Return a Response with no body so the route calls res.end() rather than
  // trying to pipe a ReadableStream, which avoids stream-teardown noise.
  new Response(null, {
    status: 200,
    headers: { "Content-Type": "application/pdf" },
  }),
);

// ── Fixtures ──────────────────────────────────────────────────────────────────

let payrollRoleId: number;
let payrollUserId: number;
let sysadminRoleId: number;
let sysadminUserId: number;
let hrAccessRoleId: number;
let hrAccessUserId: number;
let viewDirectoryOnlyRoleId: number;
let viewDirectoryOnlyUserId: number;
let unpermittedRoleId: number;
let unpermittedUserId: number;

beforeAll(async () => {
  payrollRoleId = await createTestRole(["view_payroll"]);
  payrollUserId = await createTestUser(payrollRoleId);

  sysadminRoleId = await createTestRole(["sysadmin"]);
  sysadminUserId = await createTestUser(sysadminRoleId);

  hrAccessRoleId = await createTestRole(["hr:access"]);
  hrAccessUserId = await createTestUser(hrAccessRoleId);

  // Self-service users have view_employee_directory but not hr:access or view_payroll.
  // They must NOT get blanket object storage access.
  viewDirectoryOnlyRoleId = await createTestRole(["view_employee_directory", "view_own_profile"]);
  viewDirectoryOnlyUserId = await createTestUser(viewDirectoryOnlyRoleId);

  unpermittedRoleId = await createTestRole(["view_employees"]);
  unpermittedUserId = await createTestUser(unpermittedRoleId);
});

afterAll(async () => {
  await cleanupUser(payrollUserId);
  await cleanupRole(payrollRoleId);
  await cleanupUser(sysadminUserId);
  await cleanupRole(sysadminRoleId);
  await cleanupUser(hrAccessUserId);
  await cleanupRole(hrAccessRoleId);
  await cleanupUser(viewDirectoryOnlyUserId);
  await cleanupRole(viewDirectoryOnlyRoleId);
  await cleanupUser(unpermittedUserId);
  await cleanupRole(unpermittedRoleId);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/storage/objects/* — ACL enforcement", () => {
  const PATH = "/api/storage/objects/some/certificate.pdf";

  it("(a) returns 401 for unauthenticated callers (no session)", async () => {
    const api = buildApp(storageRouter); // no userId → no session
    const res = await api.get(PATH);
    expect(res.status).toBe(401);
  });

  it("(b) returns 403 for authenticated callers with no relevant permission", async () => {
    const api = buildApp(storageRouter, unpermittedUserId);
    const res = await api.get(PATH);
    expect(res.status).toBe(403);
  });

  it("(c) returns 200 for callers with view_payroll", async () => {
    const api = buildApp(storageRouter, payrollUserId);
    const res = await api.get(PATH);
    expect(res.status).toBe(200);
  });

  it("(d) returns 200 for sysadmin callers", async () => {
    const api = buildApp(storageRouter, sysadminUserId);
    const res = await api.get(PATH);
    expect(res.status).toBe(200);
  });

  it("(e) returns 200 for callers with hr:access (onboarding certificate reviewers)", async () => {
    const api = buildApp(storageRouter, hrAccessUserId);
    const res = await api.get(PATH);
    expect(res.status).toBe(200);
  });

  it("(f) returns 403 for self-service users with only view_employee_directory — no per-object ownership enforcement exists", async () => {
    const api = buildApp(storageRouter, viewDirectoryOnlyUserId);
    const res = await api.get(PATH);
    expect(res.status).toBe(403);
  });
});
