/**
 * Permission cache invalidation tests.
 *
 * Verifies that:
 *  1. After `invalidatePermissionsCache(userId)`, the very next request fetches
 *     fresh permissions from DB — permission changes take effect immediately.
 *  2. Without eviction, a cached permission set persists despite a DB change
 *     (confirms the cache is actually working, not just a no-op).
 *  3. `invalidatePermissionsCache` for user A leaves user B's cache intact —
 *     targeted eviction does not cause collateral cache misses.
 *  4. `clearPermissionsCache` evicts ALL entries so every user re-fetches.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, rolesTable, usersTable } from "@workspace/db";
import hrRouter from "../routes/hr";
import {
  invalidatePermissionsCache,
  clearPermissionsCache,
} from "../middlewares/requirePermission";
import {
  buildApp,
  createTestEmployee,
  cleanupEmployee,
  createTestRole,
  cleanupRole,
  createTestUser,
  cleanupUser,
} from "./helpers";

// ── Shared employee for PATCH tests ──────────────────────────────────────────

let sharedEmpId: number;
beforeAll(async () => { sharedEmpId = await createTestEmployee(); });
afterAll(async () => { await cleanupEmployee(sharedEmpId); });

// ── Test 1 — evicted entry re-fetches fresh permissions ──────────────────────

describe("invalidatePermissionsCache — evicted user sees updated permissions immediately", () => {
  let roleId: number;
  let userId: number;

  beforeAll(async () => {
    roleId = await createTestRole(["edit_employees"]);
    userId = await createTestUser(roleId);
  });

  afterAll(async () => {
    await cleanupUser(userId);
    await cleanupRole(roleId);
  });

  it("user can edit employee → permissions stripped in DB → evicted → 403 on next request", async () => {
    const api = buildApp(hrRouter, userId);

    // Warm the cache: user has edit_employees, PATCH should succeed (not 403).
    const warm = await api
      .patch(`/api/employees/${sharedEmpId}`)
      .send({ jobTitle: "Before" });
    expect(warm.status).not.toBe(403);

    // Remove edit_employees from the role in DB — cache still holds old entry.
    await db
      .update(rolesTable)
      .set({ permissions: [] as never })
      .where(eq(rolesTable.id, roleId));

    // Without eviction, the cached entry is still valid → still not 403.
    const cached = await api
      .patch(`/api/employees/${sharedEmpId}`)
      .send({ jobTitle: "Cached" });
    expect(cached.status).not.toBe(403); // cache hit — old permissions still in effect

    // Evict the cache entry for this user.
    invalidatePermissionsCache(userId);

    // Now the cache miss triggers a fresh DB lookup → new empty permissions → 403.
    const fresh = await api
      .patch(`/api/employees/${sharedEmpId}`)
      .send({ jobTitle: "After" });
    expect(fresh.status).toBe(403);
  });
});

// ── Test 2 — targeted eviction does NOT affect other users ───────────────────

describe("invalidatePermissionsCache — targeted eviction leaves unrelated users' cache intact", () => {
  let roleA: number;
  let userA: number;
  let roleB: number;
  let userB: number;

  beforeAll(async () => {
    roleA = await createTestRole(["edit_employees"]);
    userA = await createTestUser(roleA);
    roleB = await createTestRole(["edit_employees"]);
    userB = await createTestUser(roleB);
  });

  afterAll(async () => {
    await cleanupUser(userA);
    await cleanupRole(roleA);
    await cleanupUser(userB);
    await cleanupRole(roleB);
  });

  it("evicting userA leaves userB able to use their cached permissions", async () => {
    const apiA = buildApp(hrRouter, userA);
    const apiB = buildApp(hrRouter, userB);

    // Warm caches for both users.
    await apiA.patch(`/api/employees/${sharedEmpId}`).send({ jobTitle: "A1" });
    await apiB.patch(`/api/employees/${sharedEmpId}`).send({ jobTitle: "B1" });

    // Remove edit_employees from roleA only.
    await db
      .update(rolesTable)
      .set({ permissions: [] as never })
      .where(eq(rolesTable.id, roleA));

    // Evict only userA.
    invalidatePermissionsCache(userA);

    // userA re-fetches from DB → new permissions → 403.
    const resA = await apiA
      .patch(`/api/employees/${sharedEmpId}`)
      .send({ jobTitle: "A2" });
    expect(resA.status).toBe(403);

    // userB's cache was NOT evicted → still uses cached edit_employees → not 403.
    const resB = await apiB
      .patch(`/api/employees/${sharedEmpId}`)
      .send({ jobTitle: "B2" });
    expect(resB.status).not.toBe(403);
  });
});

// ── Test 3 — clearPermissionsCache evicts all ────────────────────────────────

describe("clearPermissionsCache — evicts every user so all re-fetch on next request", () => {
  let roleC: number;
  let userC: number;
  let roleD: number;
  let userD: number;

  beforeAll(async () => {
    roleC = await createTestRole(["edit_employees"]);
    userC = await createTestUser(roleC);
    roleD = await createTestRole(["edit_employees"]);
    userD = await createTestUser(roleD);
  });

  afterAll(async () => {
    await cleanupUser(userC);
    await cleanupRole(roleC);
    await cleanupUser(userD);
    await cleanupRole(roleD);
  });

  it("after clearPermissionsCache, both users re-fetch and see DB changes", async () => {
    const apiC = buildApp(hrRouter, userC);
    const apiD = buildApp(hrRouter, userD);

    // Warm caches.
    await apiC.patch(`/api/employees/${sharedEmpId}`).send({ jobTitle: "C1" });
    await apiD.patch(`/api/employees/${sharedEmpId}`).send({ jobTitle: "D1" });

    // Remove edit_employees from both roles.
    await db
      .update(rolesTable)
      .set({ permissions: [] as never })
      .where(eq(rolesTable.id, roleC));
    await db
      .update(rolesTable)
      .set({ permissions: [] as never })
      .where(eq(rolesTable.id, roleD));

    // Clear the entire cache.
    clearPermissionsCache();

    // Both users re-fetch → see empty permissions → 403.
    const resC = await apiC
      .patch(`/api/employees/${sharedEmpId}`)
      .send({ jobTitle: "C2" });
    expect(resC.status).toBe(403);

    const resD = await apiD
      .patch(`/api/employees/${sharedEmpId}`)
      .send({ jobTitle: "D2" });
    expect(resD.status).toBe(403);
  });
});
