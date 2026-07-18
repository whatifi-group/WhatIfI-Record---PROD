/**
 * Regression test for a real production gap: routes/sysadmin/index.ts had no
 * server-side permission enforcement — any authenticated user could call
 * /api/sysadmin/* directly (roles, users, LOV, qualification types, summary)
 * even without the "sysadmin" permission, bypassing the frontend's UI-level
 * route guard. Fixed by gating the whole sysadmin router with
 * requirePermission(["sysadmin"]) once, at the mount point.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import sysadminRouter from "../routes/sysadmin";
import {
  buildApp,
  createTestRole,
  createTestUser,
  cleanupRole,
  cleanupUser,
} from "./helpers";

let sysadminRoleId: number;
let sysadminUserId: number;
let unpermittedRoleId: number;
let unpermittedUserId: number;

beforeAll(async () => {
  sysadminRoleId = await createTestRole(["sysadmin"]);
  sysadminUserId = await createTestUser(sysadminRoleId);

  // Mirrors a real self-service employee: authenticated, but no sysadmin
  // (or hr:access) permission at all.
  unpermittedRoleId = await createTestRole(["view_own_profile"]);
  unpermittedUserId = await createTestUser(unpermittedRoleId);
});

afterAll(async () => {
  await cleanupUser(sysadminUserId);
  await cleanupRole(sysadminRoleId);
  await cleanupUser(unpermittedUserId);
  await cleanupRole(unpermittedRoleId);
});

describe("sysadmin router — permission enforcement", () => {
  it("returns 401 for unauthenticated callers", async () => {
    const api = buildApp(sysadminRouter);
    const res = await api.get("/api/sysadmin/roles");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated user without sysadmin permission", async () => {
    const api = buildApp(sysadminRouter, unpermittedUserId);
    const res = await api.get("/api/sysadmin/roles");
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-sysadmin callers on /sysadmin/users too", async () => {
    const api = buildApp(sysadminRouter, unpermittedUserId);
    const res = await api.get("/api/sysadmin/users");
    expect(res.status).toBe(403);
  });

  it("returns 200 for callers with sysadmin permission", async () => {
    const api = buildApp(sysadminRouter, sysadminUserId);
    const res = await api.get("/api/sysadmin/roles");
    expect(res.status).toBe(200);
  });
});
