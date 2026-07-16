import express, { type IRouter } from "express";
import supertest from "supertest";
import {
  db,
  employeesTable,
  qualificationTypesTable,
  employeeQualificationsTable,
  rolesTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Build a minimal Express app that mounts `router` at /api without the real
 * auth/session middleware.
 *
 * Pass `userId` to inject a fake session so `requirePermission` middleware can
 * read `req.session.userId` and perform its normal DB permission check.
 */
export function buildApp(router: IRouter, userId?: number) {
  const app = express();
  app.use(express.json());
  if (userId !== undefined) {
    app.use((_req, _res, next) => {
      // @ts-expect-error — fake session for tests only
      _req.session = { userId };
      next();
    });
  }
  app.use("/api", router);
  return supertest(app);
}

let counter = 0;

/** Insert a minimal employee into the DB and return its id. */
export async function createTestEmployee(): Promise<number> {
  const unique = `${Date.now()}-${++counter}`;
  const [emp] = await db
    .insert(employeesTable)
    .values({
      firstName: "Test",
      lastName: "Employee",
      email: `test-${unique}@example-test.invalid`,
      jobTitle: "Tester",
      employmentType: "full_time",
      startDate: "2024-01-01",
    })
    .returning({ id: employeesTable.id });
  return emp.id;
}

/** Delete the employee (cascades to all child records). */
export async function cleanupEmployee(id: number): Promise<void> {
  await db.delete(employeesTable).where(eq(employeesTable.id, id));
}

/** Insert a qualification type with no expiry and return its id. */
export async function createTestQualType(name?: string): Promise<number> {
  const unique = `${Date.now()}-${++counter}`;
  const [qt] = await db
    .insert(qualificationTypesTable)
    .values({ name: name ?? `Test Qual Type ${unique}` })
    .returning({ id: qualificationTypesTable.id });
  return qt.id;
}

/** Delete a qualification type by id. */
export async function cleanupQualType(id: number): Promise<void> {
  await db
    .delete(qualificationTypesTable)
    .where(eq(qualificationTypesTable.id, id));
}

/**
 * Insert an employee qualification directly with an explicit expiryDate.
 * Bypasses the API so tests can control dates precisely.
 */
export async function createTestQualification(
  employeeId: number,
  qualTypeId: number,
  expiryDate: string | null,
): Promise<number> {
  const [q] = await db
    .insert(employeeQualificationsTable)
    .values({
      employeeId,
      qualificationTypeId: qualTypeId,
      dateAchieved: "2020-01-01",
      expiryDate,
    })
    .returning({ id: employeeQualificationsTable.id });
  return q.id;
}

/**
 * Insert a role with the given permissions and return its id.
 * Used by tests that exercise permission-gated routes.
 */
export async function createTestRole(
  permissions: string[],
  name?: string,
): Promise<number> {
  const unique = `${Date.now()}-${++counter}`;
  const [role] = await db
    .insert(rolesTable)
    .values({
      name: name ?? `Test Role ${unique}`,
      permissions: permissions as never,
    })
    .returning({ id: rolesTable.id });
  return role.id;
}

/** Delete a role by id. */
export async function cleanupRole(id: number): Promise<void> {
  await db.delete(rolesTable).where(eq(rolesTable.id, id));
}

/**
 * Insert a minimal user with the given roleId and return its id.
 * The user has no individual permission overrides; permissions come from
 * the role.
 */
export async function createTestUser(roleId: number): Promise<number> {
  const unique = `${Date.now()}-${++counter}`;
  const [user] = await db
    .insert(usersTable)
    .values({
      name: "Test User",
      email: `test-user-${unique}@example-test.invalid`,
      passwordHash: "not-a-real-hash",
      roleId,
      permissions: [],
    })
    .returning({ id: usersTable.id });
  return user.id;
}

/** Delete a user by id. */
export async function cleanupUser(id: number): Promise<void> {
  await db.delete(usersTable).where(eq(usersTable.id, id));
}

/**
 * Runs a cleanup function and swallows any error.
 *
 * Use inside `afterAll` blocks so that one cleanup failure (or an undefined id
 * left behind by a partially-failed `beforeAll`) cannot prevent the remaining
 * cleanups from executing.
 */
export async function safeCleanup(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // intentionally swallowed — cleanup is best-effort
  }
}
