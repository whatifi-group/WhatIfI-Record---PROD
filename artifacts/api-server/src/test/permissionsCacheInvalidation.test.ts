/**
 * Regression tests for the in-process permissions cache invalidation.
 *
 * Verifies that:
 *  1. A deleted user's cached permissions are evicted immediately so they
 *     cannot retain access for up to 60 s on a still-active session.
 *  2. Updating a user's role/permissions evicts only that user's cache entry.
 *  3. Updating a role's permissions clears all cached entries so every member
 *     sees fresh permissions on the next request.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import sysadminRouter from "../routes/sysadmin";
import hrRouter from "../routes/hr";
import {
  buildApp,
  createTestEmployee,
  cleanupEmployee,
  createTestRole,
  cleanupRole,
  createTestUser,
  cleanupUser,
} from "./helpers";
import { db, rolesTable, usersTable, userRolesTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/password";
import {
  getEffectivePermissions,
  clearPermissionsCache,
} from "../middlewares/requirePermission";

// ── shared state ──────────────────────────────────────────────────────────────

let employeeId: number;

// sysadmin user — used to call the sysadmin API in tests
let sysadminRoleId: number;
let sysadminUserId: number;

beforeAll(async () => {
  employeeId = await createTestEmployee();
  sysadminRoleId = await createTestRole(["sysadmin"], "Sysadmin");
  sysadminUserId = await createTestUser(sysadminRoleId);
});

afterAll(async () => {
  await cleanupEmployee(employeeId);
  // sysadminUser may already be deleted by a test; ignore errors.
  try { await cleanupUser(sysadminUserId); } catch { /* already gone */ }
  await cleanupRole(sysadminRoleId);
});

// ── Test 1: user deletion evicts cache ───────────────────────────────────────

describe("Permission cache — user deletion", () => {
  it("evicts the deleted user's cache entry so stale permissions are not served", async () => {
    // Create a user with view_payroll so their permissions are non-empty.
    const roleId = await createTestRole(["view_payroll"], "Payroll Role");
    const userId = await createTestUser(roleId);

    try {
      // Prime the cache.
      const before = await getEffectivePermissions(userId);
      expect(before.has("view_payroll")).toBe(true);

      // Delete the user via the sysadmin API (this should evict the cache).
      const res = await buildApp(sysadminRouter, sysadminUserId)
        .delete(`/api/sysadmin/users/${userId}`);
      expect(res.status).toBe(204);

      // After deletion the cache entry must be gone — getEffectivePermissions
      // should hit the DB, find no row, and return an empty Set.
      const after = await getEffectivePermissions(userId);
      expect(after.size).toBe(0);
    } finally {
      // User is already deleted; only clean up the role.
      await cleanupRole(roleId);
    }
  });
});

// ── Test 2: user role update evicts that user's cache ────────────────────────

describe("Permission cache — user role update", () => {
  it("evicts only the updated user's entry so the next request sees new permissions", async () => {
    const roleWithPayroll = await createTestRole(["view_payroll"], "Has Payroll");
    const roleWithEdit = await createTestRole(["edit_employees"], "Has Edit");
    const userId = await createTestUser(roleWithPayroll);

    try {
      // Prime the cache with the original role.
      const before = await getEffectivePermissions(userId);
      expect(before.has("view_payroll")).toBe(true);

      // Change the user's role via the sysadmin API.
      const res = await buildApp(sysadminRouter, sysadminUserId)
        .patch(`/api/sysadmin/users/${userId}`)
        .send({ roleIds: [roleWithEdit] });
      expect(res.status).toBe(200);

      // After the update, the cache entry is evicted; the next lookup must
      // reflect the new role (edit_employees, not view_payroll).
      const after = await getEffectivePermissions(userId);
      expect(after.has("edit_employees")).toBe(true);
      expect(after.has("view_payroll")).toBe(false);
    } finally {
      await cleanupUser(userId);
      await cleanupRole(roleWithPayroll);
      await cleanupRole(roleWithEdit);
    }
  });
});

// ── Test 3: role permission update clears all cache ──────────────────────────

describe("Permission cache — role permission update", () => {
  it("clears all cached entries so members of the changed role see fresh permissions", async () => {
    const roleId = await createTestRole(["view_payroll"], "Updatable Role");
    const userId = await createTestUser(roleId);

    try {
      // Ensure the cache starts clean, then prime it.
      clearPermissionsCache();
      const before = await getEffectivePermissions(userId);
      expect(before.has("view_payroll")).toBe(true);
      expect(before.has("edit_employees")).toBe(false);

      // Update the role's permissions via the sysadmin API.
      const res = await buildApp(sysadminRouter, sysadminUserId)
        .patch(`/api/sysadmin/roles/${roleId}`)
        .send({ permissions: ["edit_employees"] });
      expect(res.status).toBe(200);

      // All cached entries have been cleared; the next lookup hits the DB and
      // returns the updated permissions.
      const after = await getEffectivePermissions(userId);
      expect(after.has("edit_employees")).toBe(true);
      expect(after.has("view_payroll")).toBe(false);
    } finally {
      await cleanupUser(userId);
      await cleanupRole(roleId);
    }
  });
});

// ── Test 4b: role update via API evicts only that role's members ─────────────

describe("Permission cache — role update via API (targeted eviction isolation)", () => {
  it("evicts members of the updated role but leaves unrelated users' cache intact", async () => {
    // Two completely separate roles, each with one member.
    const roleA = await createTestRole(["edit_employees"], "Role A (updated)");
    const roleB = await createTestRole(["edit_employees"], "Role B (untouched)");
    const userA = await createTestUser(roleA);
    const userB = await createTestUser(roleB);

    try {
      // Prime the cache for both users.
      const beforeA = await getEffectivePermissions(userA);
      const beforeB = await getEffectivePermissions(userB);
      expect(beforeA.has("edit_employees")).toBe(true);
      expect(beforeB.has("edit_employees")).toBe(true);

      // Update roleA's permissions via the sysadmin API — roleB is untouched.
      const res = await buildApp(sysadminRouter, sysadminUserId)
        .patch(`/api/sysadmin/roles/${roleA}`)
        .send({ permissions: ["view_reports"] });
      expect(res.status).toBe(200);

      // userA's entry was evicted by the role update; they now see the new permissions.
      const afterA = await getEffectivePermissions(userA);
      expect(afterA.has("view_reports")).toBe(true);
      expect(afterA.has("edit_employees")).toBe(false);

      // userB's entry must still be cached — a DB change to roleA must not
      // evict an unrelated user.  userB still sees edit_employees from cache.
      const afterB = await getEffectivePermissions(userB);
      expect(afterB.has("edit_employees")).toBe(true);
    } finally {
      await cleanupUser(userA);
      await cleanupUser(userB);
      await cleanupRole(roleA);
      await cleanupRole(roleB);
    }
  });
});

// ── Test 5: employee deletion cascades to evict linked user's cache ──────────

describe("Permission cache — employee deletion cascades to linked user", () => {
  it("evicts the linked user's cache entry when their employee record is deleted", async () => {
    const roleId = await createTestRole(["view_payroll"], "Payroll Emp Role");

    // Create an employee, then a user linked to that employee.
    const linkedEmpId = await createTestEmployee();
    const unique = `${Date.now()}-cascade`;
    const [linkedUserRow] = await db
      .insert(usersTable)
      .values({
        name: "Linked User",
        email: `linked-${unique}@example-test.invalid`,
        passwordHash: "not-a-real-hash",
        permissions: [],
        employeeId: linkedEmpId,
      })
      .returning({ id: usersTable.id });
    const linkedUserId = linkedUserRow.id;
    await db.insert(userRolesTable).values({ userId: linkedUserId, roleId });

    try {
      // Prime the cache.
      const before = await getEffectivePermissions(linkedUserId);
      expect(before.has("view_payroll")).toBe(true);

      // Delete the employee — cascades to the linked user and should evict cache.
      const res = await buildApp(hrRouter, sysadminUserId)
        .delete(`/api/employees/${linkedEmpId}`);
      expect(res.status).toBe(204);

      // Cache must be evicted; DB has no row now, so returns empty set.
      const after = await getEffectivePermissions(linkedUserId);
      expect(after.size).toBe(0);
    } finally {
      // Both employee and user are deleted by cascade; only clean up the role.
      await cleanupRole(roleId);
    }
  });
});

// ── Test 4: permission-gated route returns 403 for deleted user ──────────────

describe("Permission cache — deleted user loses route access", () => {
  it("returns 403 on a permissioned route after the user is deleted", async () => {
    const roleId = await createTestRole(["view_payroll"], "Payroll Only");
    const userId = await createTestUser(roleId);

    try {
      // Prime the cache via the HR route — user should see the route (not 403).
      const before = await buildApp(hrRouter, userId)
        .get(`/api/employees/${employeeId}/pay-rates`);
      expect(before.status).not.toBe(403);

      // Delete the user.
      const del = await buildApp(sysadminRouter, sysadminUserId)
        .delete(`/api/sysadmin/users/${userId}`);
      expect(del.status).toBe(204);

      // With the cache evicted, getEffectivePermissions will return an empty
      // set for this userId (no DB row), so requirePermission returns 403.
      const after = await buildApp(hrRouter, userId)
        .get(`/api/employees/${employeeId}/pay-rates`);
      expect(after.status).toBe(403);
    } finally {
      await cleanupRole(roleId);
      // User is already deleted.
    }
  });
});

// ── Test 6: name-only role update does NOT evict cache ────────────────────────
//
// The PATCH /sysadmin/roles/:id handler only runs eviction when `permissions`
// is present in the request body.  These two tests pin that conditional: one
// confirms the cache stays warm on a name-only patch; the other confirms
// eviction fires when permissions ARE included (the positive anchor).

describe("Permission cache — name-only role update skips eviction", () => {
  it("leaves cached permissions intact when only the role name is patched", async () => {
    const roleId = await createTestRole(["view_payroll"], "Original Name");
    const userId = await createTestUser(roleId);

    try {
      // Start with a clean cache, then prime it for this user.
      clearPermissionsCache();
      const primed = await getEffectivePermissions(userId);
      expect(primed.has("view_payroll")).toBe(true);

      // Mutate permissions directly in DB — bypasses the API so no eviction fires.
      await db
        .update(rolesTable)
        .set({ permissions: ["edit_employees"] as never })
        .where(eq(rolesTable.id, roleId));

      // PATCH only the name; `permissions` is absent from the body, so eviction
      // must NOT be triggered.
      const res = await buildApp(sysadminRouter, sysadminUserId)
        .patch(`/api/sysadmin/roles/${roleId}`)
        .send({ name: "Updated Name" });
      expect(res.status).toBe(200);

      // Cache was not evicted: getEffectivePermissions returns the stale cached
      // set (view_payroll) rather than the value now in DB (edit_employees).
      const after = await getEffectivePermissions(userId);
      expect(after.has("view_payroll")).toBe(true);    // stale — still in cache
      expect(after.has("edit_employees")).toBe(false); // DB value, not yet seen
    } finally {
      await cleanupUser(userId);
      await cleanupRole(roleId);
    }
  });

  it("evicts cached permissions when the permissions field is included in the PATCH", async () => {
    const roleId = await createTestRole(["view_payroll"], "Eviction Anchor Role");
    const userId = await createTestUser(roleId);

    try {
      // Prime the cache.
      clearPermissionsCache();
      const primed = await getEffectivePermissions(userId);
      expect(primed.has("view_payroll")).toBe(true);

      // PATCH with a permissions field — eviction must fire for this user.
      const res = await buildApp(sysadminRouter, sysadminUserId)
        .patch(`/api/sysadmin/roles/${roleId}`)
        .send({ permissions: ["edit_employees"] });
      expect(res.status).toBe(200);

      // Cache was evicted: next lookup hits DB and returns the updated permissions.
      const after = await getEffectivePermissions(userId);
      expect(after.has("edit_employees")).toBe(true);
      expect(after.has("view_payroll")).toBe(false);
    } finally {
      await cleanupUser(userId);
      await cleanupRole(roleId);
    }
  });
});
