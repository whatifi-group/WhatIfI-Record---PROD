/**
 * Employee ↔ User provisioning integration tests.
 *
 * Covers:
 *  - POST /employees creates a linked user account in the same transaction
 *  - Duplicate email → 409
 *  - Unknown role → 400
 *  - DELETE /employees/:id cascades to delete the linked user
 *  - PATCH /employees/:id { status: "leaver" } suspends the linked user
 *  - GET /sysadmin/users excludes suspended leaver accounts but includes
 *    system accounts regardless of status
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type IRouter } from "express";
import supertest from "supertest";
import { and, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import hrRouter from "../routes/hr";
import sysadminRouter from "../routes/sysadmin";
import {
  createTestRole,
  cleanupRole,
  createTestUser,
  cleanupUser,
  createTestEmployee,
  cleanupEmployee,
} from "./helpers";

// ── test app ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express app mounting both routers so that the full
 * employee ↔ user lifecycle can be exercised in one test suite.
 */
function buildCombinedApp(userId?: number) {
  const app = express();
  app.use(express.json());
  if (userId !== undefined) {
    app.use((_req, _res, next) => {
      // @ts-expect-error — fake session for tests
      _req.session = { userId };
      next();
    });
  }
  app.use("/api", hrRouter as IRouter);
  app.use("/api", sysadminRouter as IRouter);
  return supertest(app);
}

// ── shared state ─────────────────────────────────────────────────────────────

// A role for the new employees' linked user accounts
let employeeRoleId: number;
// A sysadmin user that can DELETE employees
let sysadminRoleId: number;
let sysadminUserId: number;
// An edit_employees user for PATCH tests
let editorRoleId: number;
let editorUserId: number;

// Track resources created during tests for cleanup
const employeeIdsToClean: number[] = [];
const userIdsToClean: number[] = [];

beforeAll(async () => {
  employeeRoleId = await createTestRole([], "Employee Role (link test)");
  sysadminRoleId = await createTestRole(["sysadmin"], "Sysadmin (link test)");
  sysadminUserId = await createTestUser(sysadminRoleId);
  editorRoleId = await createTestRole(["edit_employees"], "Editor (link test)");
  editorUserId = await createTestUser(editorRoleId);
});

afterAll(async () => {
  // Employees first (cascade-deletes linked users created via POST /employees)
  for (const id of employeeIdsToClean) {
    await cleanupEmployee(id).catch(() => {/* may already be deleted by a test */});
  }
  // Explicitly-created user rows not tied to employees
  for (const id of userIdsToClean) {
    await cleanupUser(id).catch(() => {/* may already be gone */});
  }
  await cleanupUser(editorUserId);
  await cleanupRole(editorRoleId);
  await cleanupUser(sysadminUserId);
  await cleanupRole(sysadminRoleId);
  await cleanupRole(employeeRoleId);
});

// ── helpers ───────────────────────────────────────────────────────────────────

let _counter = 0;
function uniqueEmail(prefix = "link-test") {
  return `${prefix}-${Date.now()}-${++_counter}@example-test.invalid`;
}

/** Minimal valid body for POST /employees */
function makeEmployeeBody(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Test",
    lastName: "Linker",
    email: uniqueEmail(),
    jobTitle: "Tester",
    employmentType: "full_time",
    status: "active",
    startDate: "2024-01-01",
    userRole: employeeRoleId,
    temporaryPassword: "Temp1234!",
    ...overrides,
  };
}

// ── POST /employees — provisioning ───────────────────────────────────────────

describe("POST /employees — user provisioning", () => {
  it("201 and creates a linked user row with employeeId set", async () => {
    const api = buildCombinedApp(editorUserId);
    const body = makeEmployeeBody();

    const res = await api.post("/api/employees").send(body);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();

    const empId: number = res.body.id;
    employeeIdsToClean.push(empId);

    // Confirm user row was created and linked to this employee
    const [user] = await db
      .select({ id: usersTable.id, employeeId: usersTable.employeeId, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.employeeId, empId));

    expect(user).toBeDefined();
    expect(user.employeeId).toBe(empId);
    expect(user.status).toBe("active");
  });

  it("409 when email already exists in users table", async () => {
    const api = buildCombinedApp(editorUserId);
    const email = uniqueEmail("dup");

    // Pre-create a user with this email
    const [existingUser] = await db
      .insert(usersTable)
      .values({
        name: "Pre-existing",
        email,
        passwordHash: "not-a-real-hash",
        permissions: [],
        roleId: employeeRoleId,
      })
      .returning({ id: usersTable.id });
    userIdsToClean.push(existingUser.id);

    const res = await api
      .post("/api/employees")
      .send(makeEmployeeBody({ email }));

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("400 when userRole does not exist", async () => {
    const api = buildCombinedApp(editorUserId);

    const res = await api
      .post("/api/employees")
      .send(makeEmployeeBody({ userRole: 999_999_999 }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });
});

// ── DELETE /employees/:id — cascade ──────────────────────────────────────────

describe("DELETE /employees/:id — cascade-deletes linked user", () => {
  it("deletes the linked user row when the employee is deleted", async () => {
    const api = buildCombinedApp(sysadminUserId);
    const body = makeEmployeeBody();

    // Create via API to get the transactional user row
    const createRes = await api.post("/api/employees").send(body);
    expect(createRes.status).toBe(201);
    const empId: number = createRes.body.id;

    // Confirm user exists before deletion
    const [userBefore] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.employeeId, empId));
    expect(userBefore).toBeDefined();
    const linkedUserId = userBefore.id;

    // Delete the employee (sysadmin-only route)
    const deleteRes = await api.delete(`/api/employees/${empId}`);
    expect(deleteRes.status).toBe(204);

    // The linked user must be gone (FK cascade)
    const [userAfter] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, linkedUserId));
    expect(userAfter).toBeUndefined();
  });
});

// ── PATCH /employees/:id — leaver suspend ────────────────────────────────────

describe("PATCH /employees/:id — marking as leaver suspends linked user", () => {
  it("sets linked user status to 'suspended' when employee becomes a leaver", async () => {
    const api = buildCombinedApp(editorUserId);
    const body = makeEmployeeBody();

    const createRes = await api.post("/api/employees").send(body);
    expect(createRes.status).toBe(201);
    const empId: number = createRes.body.id;
    employeeIdsToClean.push(empId);

    // Confirm user is currently active
    const [userBefore] = await db
      .select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.employeeId, empId));
    expect(userBefore.status).toBe("active");

    // Mark as leaver
    const patchRes = await api
      .patch(`/api/employees/${empId}`)
      .send({ status: "leaver", leaverReason: "resignation" });
    expect(patchRes.status).toBe(200);

    // Linked user must now be suspended
    const [userAfter] = await db
      .select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.employeeId, empId));
    expect(userAfter.status).toBe("suspended");
  });
});

// ── GET /sysadmin/users — visibility rules ───────────────────────────────────

describe("GET /sysadmin/users — leaver accounts excluded; system accounts included", () => {
  let leaver1EmpId: number;
  let systemUserId: number;

  beforeAll(async () => {
    const api = buildCombinedApp(editorUserId);

    // Create an employee, mark as leaver → their user becomes suspended+linked
    const createRes = await api
      .post("/api/employees")
      .send(makeEmployeeBody());
    expect(createRes.status).toBe(201);
    leaver1EmpId = createRes.body.id;
    employeeIdsToClean.push(leaver1EmpId);

    await api
      .patch(`/api/employees/${leaver1EmpId}`)
      .send({ status: "leaver", leaverReason: "resignation" });

    // Create a system account (isSystemAccount=true) that is also suspended
    const [sysUser] = await db
      .insert(usersTable)
      .values({
        name: "System Bot",
        email: uniqueEmail("system"),
        passwordHash: "not-a-real-hash",
        permissions: [],
        roleId: sysadminRoleId,
        isSystemAccount: true,
        status: "suspended",
      })
      .returning({ id: usersTable.id });
    systemUserId = sysUser.id;
    userIdsToClean.push(systemUserId);
  });

  it("excludes suspended employee-linked accounts from the list", async () => {
    const api = buildCombinedApp(sysadminUserId);
    const res = await api.get("/api/sysadmin/users");
    expect(res.status).toBe(200);

    const ids: number[] = res.body.map((u: { id: number }) => u.id);

    // Find the suspended linked user
    const [linkedUser] = await db
      .select({ id: usersTable.id, status: usersTable.status })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.employeeId, leaver1EmpId),
          eq(usersTable.status, "suspended"),
        ),
      );
    expect(linkedUser).toBeDefined();

    expect(ids).not.toContain(linkedUser.id);
  });

  it("includes system accounts even when they are suspended", async () => {
    const api = buildCombinedApp(sysadminUserId);
    const res = await api.get("/api/sysadmin/users");
    expect(res.status).toBe(200);

    const ids: number[] = res.body.map((u: { id: number }) => u.id);
    expect(ids).toContain(systemUserId);
  });
});
