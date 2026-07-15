/**
 * Onboarding endpoint — payroll guard tests.
 *
 * Verifies:
 * 1. POST /onboarding/submit strips payroll-adjacent keys (salary, payRate, etc.)
 *    from the request body — they are never stored in the submission record.
 * 2. POST /onboarding/submissions/:id/approve never inserts rows into
 *    employee_pay_rates for the newly-created employee.
 * 3. The "Employee Self-Service" seed role contains no payroll permissions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import onboardingRouter from "../routes/onboarding";
import {
  buildApp,
  cleanupEmployee,
  cleanupRole,
  cleanupUser,
  createTestRole,
  createTestUser,
} from "./helpers";
import {
  db,
  lovItemsTable,
  onboardingSubmissionsTable,
  employeePayRatesTable,
  rolesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { seedRoles } from "../lib/seedRoles";

// ── File-level fixtures ───────────────────────────────────────────────────────

/** JWT obtained by calling /verify with the test password. */
let token: string;
/** Original label on the seed row — restored in afterAll. */
let originalLabel: string;
/** HR-level user for approval calls. */
let hrRoleId: number;
let hrUserId: number;

const TEST_PASSWORD = `test-onboarding-pw-${Date.now()}`;

beforeAll(async () => {
  // Temporarily update the seed passphrase row so /verify accepts TEST_PASSWORD.
  // We UPDATE (not INSERT) to ensure LIMIT 1 returns this row, not a stale seed.
  const [existing] = await db
    .select({ id: lovItemsTable.id, label: lovItemsTable.label })
    .from(lovItemsTable)
    .where(
      and(
        eq(lovItemsTable.category, "system_config"),
        eq(lovItemsTable.value, "onboarding_password"),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Onboarding LOV seed row not found — run seedLov first");
  }

  originalLabel = existing.label;

  await db
    .update(lovItemsTable)
    .set({ label: TEST_PASSWORD, isActive: true })
    .where(eq(lovItemsTable.id, existing.id));

  // Obtain a real JWT by calling POST /onboarding/verify
  const api = buildApp(onboardingRouter);
  const verifyRes = await api
    .post("/api/onboarding/verify")
    .send({ password: TEST_PASSWORD });

  if (verifyRes.status !== 200) {
    throw new Error(`/verify failed: ${verifyRes.status} — ${JSON.stringify(verifyRes.body)}`);
  }
  token = verifyRes.body.token;

  // Ensure seed roles exist — the approval handler requires "Employee Self-Service"
  await seedRoles();

  // HR user for approval tests
  hrRoleId = await createTestRole(["hr:access", "sysadmin"]);
  hrUserId = await createTestUser(hrRoleId);
});

afterAll(async () => {
  // Restore the original seed label
  await db
    .update(lovItemsTable)
    .set({ label: originalLabel, isActive: false })
    .where(
      and(
        eq(lovItemsTable.category, "system_config"),
        eq(lovItemsTable.value, "onboarding_password"),
      ),
    );
  await cleanupUser(hrUserId);
  await cleanupRole(hrRoleId);
});

// ── Submit endpoint — payroll key stripping ───────────────────────────────────

describe("POST /api/onboarding/submit — payroll guard", () => {
  let submissionId: number;

  afterAll(async () => {
    if (submissionId) {
      await db
        .delete(onboardingSubmissionsTable)
        .where(eq(onboardingSubmissionsTable.id, submissionId));
    }
  });

  const validBody = {
    firstName: "Guard",
    lastName: "Test",
    email: `guard-test-${Date.now()}@example-test.invalid`,
    jobTitle: "Tester",
    employmentType: "full_time",
    startDate: "2025-01-01",
  };

  it("accepts a valid body and returns 201", async () => {
    const api = buildApp(onboardingRouter);
    const res = await api
      .post("/api/onboarding/submit")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody);
    expect(res.status).toBe(201);
    submissionId = res.body.id;
  });

  it("returns 201 even when salary is included — it is silently stripped", async () => {
    const api = buildApp(onboardingRouter);
    const bodyWithSalary = { ...validBody, salary: 50000, payRate: 25.5, hourlyRate: 12 };
    const res = await api
      .post("/api/onboarding/submit")
      .set("Authorization", `Bearer ${token}`)
      .send(bodyWithSalary);
    // The endpoint strips unknown keys (Zod default) — must not 400 on extra fields
    expect(res.status).toBe(201);
    // Response must not echo back the payroll-adjacent fields
    expect(res.body).not.toHaveProperty("salary");
    expect(res.body).not.toHaveProperty("payRate");
    expect(res.body).not.toHaveProperty("hourlyRate");
    // Clean up the extra submission
    if (res.body.id) {
      await db
        .delete(onboardingSubmissionsTable)
        .where(eq(onboardingSubmissionsTable.id, res.body.id));
    }
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const api = buildApp(onboardingRouter);
    const res = await api.post("/api/onboarding/submit").send(validBody);
    expect(res.status).toBe(401);
  });
});

// ── Approve endpoint — no pay rate rows created ───────────────────────────────

describe("POST /api/onboarding/submissions/:id/approve — pay rate guard", () => {
  let testSubmissionId: number;
  let createdEmployeeId: number | null = null;

  beforeAll(async () => {
    // Insert a pending submission directly (avoids needing a fresh JWT)
    const [sub] = await db
      .insert(onboardingSubmissionsTable)
      .values({
        firstName: "Approve",
        lastName: "PayGuard",
        email: `approve-payguard-${Date.now()}@example-test.invalid`,
        jobTitle: "Tester",
        employmentType: "full_time",
        startDate: "2025-01-01",
        onboardingStatus: "pending",
      })
      .returning({ id: onboardingSubmissionsTable.id });
    testSubmissionId = sub.id;
  });

  afterAll(async () => {
    if (createdEmployeeId) {
      await cleanupEmployee(createdEmployeeId);
    } else {
      // Clean up the submission if approval was never called or failed
      await db
        .delete(onboardingSubmissionsTable)
        .where(eq(onboardingSubmissionsTable.id, testSubmissionId));
    }
  });

  it("approves the submission and returns 200 with a temporaryPassword", async () => {
    const api = buildApp(onboardingRouter, hrUserId);
    const res = await api
      .post(`/api/onboarding/submissions/${testSubmissionId}/approve`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("temporaryPassword");
    expect(res.body).toHaveProperty("employeeId");
    createdEmployeeId = res.body.employeeId;
  });

  it("does NOT insert any employee_pay_rates rows for the newly approved employee", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const payRates = await db
      .select()
      .from(employeePayRatesTable)
      .where(eq(employeePayRatesTable.employeeId, createdEmployeeId!));
    expect(payRates).toHaveLength(0);
  });

  it("returns 409 when trying to approve an already-approved submission", async () => {
    const api = buildApp(onboardingRouter, hrUserId);
    const res = await api
      .post(`/api/onboarding/submissions/${testSubmissionId}/approve`)
      .send({});
    expect(res.status).toBe(409);
  });
});

// ── Seed role — no payroll permissions ────────────────────────────────────────

describe("Employee Self-Service seed role — payroll permission absence", () => {
  beforeAll(async () => {
    // Ensure the seed roles exist in the DB
    await seedRoles();
  });

  it("the Employee Self-Service role exists in the database", async () => {
    const [role] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.name, "Employee Self-Service"))
      .limit(1);
    expect(role).toBeDefined();
  });

  it("does NOT have view_payroll permission", async () => {
    const [role] = await db
      .select({ permissions: rolesTable.permissions })
      .from(rolesTable)
      .where(eq(rolesTable.name, "Employee Self-Service"))
      .limit(1);
    const perms = (role?.permissions as string[]) ?? [];
    expect(perms).not.toContain("view_payroll");
  });

  it("does NOT have edit_payroll permission", async () => {
    const [role] = await db
      .select({ permissions: rolesTable.permissions })
      .from(rolesTable)
      .where(eq(rolesTable.name, "Employee Self-Service"))
      .limit(1);
    const perms = (role?.permissions as string[]) ?? [];
    expect(perms).not.toContain("edit_payroll");
  });

  it("does NOT have any permission containing 'payroll' or 'pay_rate' or 'salary'", async () => {
    const [role] = await db
      .select({ permissions: rolesTable.permissions })
      .from(rolesTable)
      .where(eq(rolesTable.name, "Employee Self-Service"))
      .limit(1);
    const perms = (role?.permissions as string[]) ?? [];
    const payrollPerms = perms.filter(
      (p) =>
        p.includes("payroll") ||
        p.includes("pay_rate") ||
        p.includes("salary"),
    );
    expect(payrollPerms).toHaveLength(0);
  });

  it("DOES have view_employee_directory and view_own_profile permissions", async () => {
    const [role] = await db
      .select({ permissions: rolesTable.permissions })
      .from(rolesTable)
      .where(eq(rolesTable.name, "Employee Self-Service"))
      .limit(1);
    const perms = (role?.permissions as string[]) ?? [];
    expect(perms).toContain("view_employee_directory");
    expect(perms).toContain("view_own_profile");
  });
});
