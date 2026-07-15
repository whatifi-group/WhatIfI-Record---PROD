/**
 * Task #184 — Disclosure badge on the employee directory.
 *
 * Verifies that GET /employees always returns a `pendingDisclosureReview`
 * boolean field:
 * - Users with view_disclosures or sysadmin get the real computed value
 *   (false here because no disclosure data is seeded; the disclosure tables
 *   may not yet exist on this DB — see task #186 — so the query falls back
 *   gracefully to false rather than throwing).
 * - Users without view_disclosures always get false regardless of DB state.
 *
 * Full round-trip coverage (true case) requires disclosure tables to be
 * pushed to the database — tracked separately.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import router from "../routes/hr/index";
import {
  buildApp,
  cleanupEmployee,
  cleanupRole,
  cleanupUser,
  createTestEmployee,
  createTestRole,
  createTestUser,
} from "./helpers";

let viewerRoleId: number;
let viewerUserId: number;
let disclosureRoleId: number;
let disclosureUserId: number;
let sysadminRoleId: number;
let sysadminUserId: number;
let empId: number;

beforeAll(async () => {
  viewerRoleId = await createTestRole(["view_employees"]);
  viewerUserId = await createTestUser(viewerRoleId);

  disclosureRoleId = await createTestRole(["view_disclosures", "view_employees"]);
  disclosureUserId = await createTestUser(disclosureRoleId);

  sysadminRoleId = await createTestRole(["sysadmin"]);
  sysadminUserId = await createTestUser(sysadminRoleId);

  empId = await createTestEmployee();
});

afterAll(async () => {
  await cleanupEmployee(empId);
  await cleanupUser(viewerUserId);
  await cleanupUser(disclosureUserId);
  await cleanupUser(sysadminUserId);
  await cleanupRole(viewerRoleId);
  await cleanupRole(disclosureRoleId);
  await cleanupRole(sysadminRoleId);
});

// ── Field presence — always boolean ──────────────────────────────────────────

describe("GET /api/employees — pendingDisclosureReview field presence", () => {
  it("includes pendingDisclosureReview as boolean for a user without view_disclosures", async () => {
    const res = await buildApp(router, viewerUserId).get("/api/employees");

    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp).toBeDefined();
    expect(emp.pendingDisclosureReview).toBe(false);
  });

  it("includes pendingDisclosureReview as boolean for a view_disclosures user", async () => {
    const res = await buildApp(router, disclosureUserId).get("/api/employees");

    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp).toBeDefined();
    // false: no disclosures seeded (or tables not yet created — graceful fallback)
    expect(typeof emp.pendingDisclosureReview).toBe("boolean");
  });

  it("includes pendingDisclosureReview as boolean for a sysadmin user", async () => {
    const res = await buildApp(router, sysadminUserId).get("/api/employees");

    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp).toBeDefined();
    expect(typeof emp.pendingDisclosureReview).toBe("boolean");
  });

  it("returns 200 even when disclosure query fails gracefully (no disclosure tables yet)", async () => {
    // This is the main regression guard: the route must not 500 when the
    // disclosure tables are missing — the badge field simply returns false.
    const res = await buildApp(router, sysadminUserId).get("/api/employees");
    expect(res.status).toBe(200);
  });
});

// ── Permission gating ─────────────────────────────────────────────────────────

describe("GET /api/employees — pendingDisclosureReview permission gating", () => {
  it("is always false for users without view_disclosures regardless of DB state", async () => {
    // No permission → badge computation skipped; field is always false
    const res = await buildApp(router, viewerUserId).get("/api/employees");

    expect(res.status).toBe(200);
    const allFalse = (res.body as { pendingDisclosureReview?: boolean }[]).every(
      (e) => e.pendingDisclosureReview === false,
    );
    expect(allFalse).toBe(true);
  });

  it("does not 500 when called without any session (unauthenticated request)", async () => {
    // buildApp without userId → no session → badge skipped, returns false
    const res = await buildApp(router).get("/api/employees");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp).toBeDefined();
    expect(emp.pendingDisclosureReview).toBe(false);
  });
});
