/**
 * resolveSsoUser — identity mapping tests.
 *
 * Authentication is Entra's job; these tests cover the part RECORD still owns:
 * deciding which local `users` row a verified Microsoft identity corresponds
 * to, and refusing sign-in when there isn't one. They run against a real
 * database so the unique constraints and the `users_email_lowercase` CHECK are
 * genuinely exercised.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  employeesTable,
  rolesTable,
  usersTable,
  userRolesTable,
} from "@workspace/db";
import { resolveSsoUser } from "../lib/ssoUser";
import type { EntraClaims } from "../lib/entra";
import {
  createTestEmployee,
  cleanupEmployee,
  cleanupUser,
  safeCleanup,
} from "./helpers";

const TENANT = "test-tenant-id";

function claims(overrides: Partial<EntraClaims> = {}): EntraClaims {
  return {
    objectId: `oid-${randomUUID()}`,
    tenantId: TENANT,
    email: `sso-${randomUUID()}@example-test.invalid`,
    name: "SSO Test User",
    ...overrides,
  };
}

/** Insert an employee with a specific email/status, bypassing the API. */
async function createEmployeeWith(
  email: string,
  status: "active" | "on_leave" | "leaver" | "inactive" = "active",
): Promise<number> {
  const [emp] = await db
    .insert(employeesTable)
    .values({
      firstName: "SSO",
      lastName: "Candidate",
      email,
      jobTitle: "Tester",
      employmentType: "full_time",
      status,
      startDate: "2024-01-01",
    })
    .returning({ id: employeesTable.id });
  return emp.id;
}

// The default role must exist for auto-provisioning to succeed.
let defaultRoleId: number;
const createdUserIds: number[] = [];
const createdEmployeeIds: number[] = [];

beforeAll(async () => {
  const [existing] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.name, "Employee Self-Service"))
    .limit(1);

  if (existing) {
    defaultRoleId = existing.id;
  } else {
    const [role] = await db
      .insert(rolesTable)
      .values({
        name: "Employee Self-Service",
        permissions: ["view_own_profile"] as never,
      })
      .returning({ id: rolesTable.id });
    defaultRoleId = role.id;
  }
});

afterAll(async () => {
  for (const id of createdUserIds) await safeCleanup(() => cleanupUser(id));
  for (const id of createdEmployeeIds) await safeCleanup(() => cleanupEmployee(id));
});

describe("resolveSsoUser", () => {
  describe("matching an existing user", () => {
    it("matches on ms_entra_object_id", async () => {
      const c = claims();
      const [user] = await db
        .insert(usersTable)
        .values({
          name: "Existing",
          email: c.email.toLowerCase(),
          msEntraObjectId: c.objectId,
          permissions: [],
        })
        .returning({ id: usersTable.id });
      createdUserIds.push(user.id);

      // A later Entra rename changes the email but never the oid.
      const result = await resolveSsoUser({ ...c, email: "renamed@example-test.invalid" });
      expect(result).toEqual({ ok: true, userId: user.id });
    });

    it("matches on email and backfills the object id", async () => {
      const c = claims();
      const [user] = await db
        .insert(usersTable)
        .values({
          name: "Legacy",
          email: c.email.toLowerCase(),
          passwordHash: "not-a-real-hash",
          permissions: [],
        })
        .returning({ id: usersTable.id });
      createdUserIds.push(user.id);

      const result = await resolveSsoUser(c);
      expect(result).toEqual({ ok: true, userId: user.id });

      const [row] = await db
        .select({ oid: usersTable.msEntraObjectId })
        .from(usersTable)
        .where(eq(usersTable.id, user.id));
      expect(row.oid).toBe(c.objectId);
    });

    it("matches case-insensitively on a mixed-case Entra address", async () => {
      const c = claims({ email: `Mixed-${randomUUID()}@Example-Test.Invalid` });
      const [user] = await db
        .insert(usersTable)
        .values({
          name: "Mixed",
          email: c.email.toLowerCase(),
          permissions: [],
        })
        .returning({ id: usersTable.id });
      createdUserIds.push(user.id);

      const result = await resolveSsoUser(c);
      expect(result).toEqual({ ok: true, userId: user.id });
    });

    it("refuses a user whose account is not active", async () => {
      const c = claims();
      const [user] = await db
        .insert(usersTable)
        .values({
          name: "Suspended",
          email: c.email.toLowerCase(),
          msEntraObjectId: c.objectId,
          status: "suspended",
          permissions: [],
        })
        .returning({ id: usersTable.id });
      createdUserIds.push(user.id);

      expect(await resolveSsoUser(c)).toEqual({ ok: false, reason: "inactive" });
    });
  });

  describe("auto-provisioning from an employee record", () => {
    it("creates an active linked user with the default role", async () => {
      const c = claims();
      const employeeId = await createEmployeeWith(c.email.toLowerCase());
      createdEmployeeIds.push(employeeId);

      const result = await resolveSsoUser(c);
      expect(result.ok).toBe(true);

      const userId = (result as { ok: true; userId: number }).userId;
      const [row] = await db
        .select({
          email: usersTable.email,
          status: usersTable.status,
          employeeId: usersTable.employeeId,
          oid: usersTable.msEntraObjectId,
          passwordHash: usersTable.passwordHash,
          isSystemAccount: usersTable.isSystemAccount,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId));

      expect(row.email).toBe(c.email.toLowerCase());
      expect(row.status).toBe("active");
      expect(row.employeeId).toBe(employeeId);
      expect(row.oid).toBe(c.objectId);
      // SSO users never hold a password — that is what makes login break-glass.
      expect(row.passwordHash).toBeNull();
      expect(row.isSystemAccount).toBe(false);

      const roles = await db
        .select({ roleId: userRolesTable.roleId })
        .from(userRolesTable)
        .where(eq(userRolesTable.userId, userId));
      expect(roles).toEqual([{ roleId: defaultRoleId }]);
    });

    it("matches an employee whose stored email differs in case", async () => {
      const local = `Upper-${randomUUID()}@Example-Test.Invalid`;
      const employeeId = await createEmployeeWith(local);
      createdEmployeeIds.push(employeeId);

      const result = await resolveSsoUser(claims({ email: local.toLowerCase() }));
      expect(result.ok).toBe(true);
    });

    it("refuses when no employee record matches", async () => {
      expect(await resolveSsoUser(claims())).toEqual({
        ok: false,
        reason: "no_account",
      });
    });

    it("refuses a leaver", async () => {
      const c = claims();
      const employeeId = await createEmployeeWith(c.email.toLowerCase(), "leaver");
      createdEmployeeIds.push(employeeId);

      expect(await resolveSsoUser(c)).toEqual({ ok: false, reason: "no_account" });
    });

    it("refuses when two employee records share the email", async () => {
      const c = claims();
      const first = await createEmployeeWith(c.email.toLowerCase());
      const second = await createEmployeeWith(c.email.toLowerCase());
      createdEmployeeIds.push(first, second);

      expect(await resolveSsoUser(c)).toEqual({
        ok: false,
        reason: "ambiguous_email",
      });
    });

    it("creates nothing when it refuses", async () => {
      const c = claims();
      expect(await resolveSsoUser(c)).toEqual({ ok: false, reason: "no_account" });

      // Scoped to this identity rather than comparing a global row count:
      // test files run in parallel forks against one shared database, so a
      // user created by another fork between two counts would fail this
      // spuriously. Checking both lookup keys is also the stronger assertion.
      const byEmail = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, c.email.toLowerCase()));
      expect(byEmail).toHaveLength(0);

      const byObjectId = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.msEntraObjectId, c.objectId));
      expect(byObjectId).toHaveLength(0);
    });
  });
});
