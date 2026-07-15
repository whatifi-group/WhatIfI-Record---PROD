/**
 * /api/auth/me — permission merging tests.
 *
 * Verifies that the endpoint returns the correct effective permissions for a
 * user whose role carries the HR Manager permission set.  The test uses a real
 * database round-trip (role insert → user insert → GET /api/auth/me) so that
 * any future change to the permission-merging logic in `userRow` / `fetchUser`
 * is caught immediately.
 */
import express from "express";
import supertest from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import authRouter from "../routes/auth";
import {
  createTestRole,
  createTestUser,
  cleanupRole,
  cleanupUser,
} from "./helpers";

/**
 * Build a minimal Express app that mounts the auth router.
 *
 * We inject a plain session object rather than using `express-session` with a
 * real (or memory) store — that avoids the session-store round-trip that was
 * causing the test to hang for the full 20 s timeout.
 *
 * The auth route only ever reads `req.session.userId`, so a simple POJO is
 * sufficient.
 */
function buildAuthApp(userId?: number) {
  const app = express();
  app.use(express.json());
  // Always attach a session-shaped object so `req.session.userId` never throws
  app.use((_req, _res, next) => {
    // @ts-expect-error — fake session for tests only
    _req.session = userId !== undefined ? { userId } : {};
    next();
  });
  app.use("/api", authRouter);
  return supertest(app);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let hrRoleId: number;
let hrUserId: number;

let noPermsRoleId: number;
let noPermsUserId: number;

beforeAll(async () => {
  // HR Manager role: carries the standard HR permission set.
  // No explicit name — the helper generates a timestamp-unique name so parallel
  // test runs or unclean teardowns from previous runs cannot cause collisions.
  hrRoleId = await createTestRole(["hr:access", "hr:past_employees"]);
  hrUserId = await createTestUser(hrRoleId);

  // Role with no permissions — used for the "no access" assertion
  noPermsRoleId = await createTestRole([]);
  noPermsUserId = await createTestUser(noPermsRoleId);
});

afterAll(async () => {
  await cleanupUser(hrUserId);
  await cleanupRole(hrRoleId);
  await cleanupUser(noPermsUserId);
  await cleanupRole(noPermsRoleId);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/auth/me — effective permissions for HR Manager role", () => {
  it("returns 401 when there is no session", async () => {
    const api = buildAuthApp(); // no userId injected
    const res = await api.get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns hr:access and hr:past_employees for a user with the HR Manager role", async () => {
    const api = buildAuthApp(hrUserId);
    const res = await api.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.permissions).toContain("hr:access");
    expect(res.body.permissions).toContain("hr:past_employees");
  });

  it("does NOT return sysadmin for a user with the HR Manager role", async () => {
    const api = buildAuthApp(hrUserId);
    const res = await api.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.permissions).not.toContain("sysadmin");
  });

  it("returns an empty permissions array for a role with no permissions", async () => {
    const api = buildAuthApp(noPermsUserId);
    const res = await api.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual([]);
  });

  it("merges role permissions and user-level permissions without duplicates", async () => {
    // Create a user whose role has hr:access AND who has an individual hr:access override —
    // the merged set must not contain duplicates.
    const { db, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    // Grant the same permission at the user level too
    await db
      .update(usersTable)
      .set({ permissions: ["hr:access"] as never })
      .where(eq(usersTable.id, hrUserId));

    const api = buildAuthApp(hrUserId);
    const res = await api.get("/api/auth/me");

    expect(res.status).toBe(200);
    const perms: string[] = res.body.permissions;
    const hrAccessCount = perms.filter((p) => p === "hr:access").length;
    expect(hrAccessCount).toBe(1); // de-duplicated

    // Reset to a clean state
    await db
      .update(usersTable)
      .set({ permissions: [] as never })
      .where(eq(usersTable.id, hrUserId));
  });
});
