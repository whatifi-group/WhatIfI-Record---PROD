/**
 * Onboarding endpoint — payroll guard tests + self-service directory access
 * + approval data-copy integration tests.
 *
 * Verifies:
 * 1. POST /onboarding/submit strips payroll-adjacent keys (salary, payRate, etc.)
 *    from the request body — they are never stored in the submission record.
 * 2. POST /onboarding/submissions/:id/approve never inserts rows into
 *    employee_pay_rates for the newly-created employee.
 * 3. The "Employee Self-Service" seed role contains no payroll permissions.
 * 4. After approving an onboarding submission, the created employee user can
 *    call GET /api/directory (200) and the response contains no payroll fields.
 * 5. GET /api/directory returns 403 for a user without view_employee_directory.
 * 6. copySubmissionExtendedData copies address, next-of-kin, medical, disclosure,
 *    and Update Service consent rows into employee tables on approval.
 * 7. Partial submissions (e.g. no disclosure section) complete without error
 *    and leave the corresponding employee tables empty.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import onboardingRouter from "../routes/onboarding";
import directoryRouter from "../routes/directory";
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
  onboardingAddressesTable,
  onboardingNextOfKinTable,
  onboardingNextOfKinPhonesTable,
  onboardingMedicalTable,
  onboardingDisclosuresTable,
  employeePayRatesTable,
  employeeAddressesTable,
  employeeNextOfKinTable,
  employeeNextOfKinPhonesTable,
  employeeMedicalSelectionsTable,
  employeeDisclosuresTable,
  employeeDisclosureConsentsTable,
  rolesTable,
  usersTable,
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

// ── Directory access after approval ───────────────────────────────────────────

describe("POST approve → employee user → GET /api/directory", () => {
  let submissionId: number;
  let approvedEmployeeId: number | null = null;
  let approvedUserId: number | null = null;

  beforeAll(async () => {
    const [sub] = await db
      .insert(onboardingSubmissionsTable)
      .values({
        firstName: "Directory",
        lastName: "AccessTest",
        email: `dir-access-${Date.now()}@example-test.invalid`,
        jobTitle: "Tester",
        employmentType: "full_time",
        startDate: "2025-06-01",
        onboardingStatus: "pending",
      })
      .returning({ id: onboardingSubmissionsTable.id });
    submissionId = sub.id;
  });

  afterAll(async () => {
    if (approvedEmployeeId) {
      await cleanupEmployee(approvedEmployeeId);
    } else {
      await db
        .delete(onboardingSubmissionsTable)
        .where(eq(onboardingSubmissionsTable.id, submissionId));
    }
  });

  it("approves the submission and creates a user account", async () => {
    const api = buildApp(onboardingRouter, hrUserId);
    const res = await api
      .post(`/api/onboarding/submissions/${submissionId}/approve`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("employeeId");
    approvedEmployeeId = res.body.employeeId;

    // Look up the created user for this employee
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.employeeId, approvedEmployeeId!))
      .limit(1);
    expect(user).toBeDefined();
    approvedUserId = user.id;
  });

  it("GET /api/directory returns 200 for the approved employee user", async () => {
    expect(approvedUserId).not.toBeNull();
    const api = buildApp(directoryRouter, approvedUserId!);
    const res = await api.get("/api/directory");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("directory response contains no salary, payRate, hourlyRate or employeePayRates fields", async () => {
    expect(approvedUserId).not.toBeNull();
    const api = buildApp(directoryRouter, approvedUserId!);
    const res = await api.get("/api/directory");
    for (const row of res.body as Array<Record<string, unknown>>) {
      expect(row).not.toHaveProperty("salary");
      expect(row).not.toHaveProperty("payRate");
      expect(row).not.toHaveProperty("hourlyRate");
      expect(row).not.toHaveProperty("employeePayRates");
    }
  });

  it("GET /api/directory returns 403 for a user without view_employee_directory", async () => {
    const noPermRoleId = await createTestRole(["view_own_profile"]);
    const noPermUserId = await createTestUser(noPermRoleId);
    try {
      const api = buildApp(directoryRouter, noPermUserId);
      const res = await api.get("/api/directory");
      expect(res.status).toBe(403);
    } finally {
      await cleanupUser(noPermUserId);
      await cleanupRole(noPermRoleId);
    }
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

// ── Auth guard tests ──────────────────────────────────────────────────────────
// Verifies that PATCH /onboarding/passphrase and GET /onboarding/passphrase-status
// return 403 for callers who lack hr:access or sysadmin permissions.

describe("Onboarding passphrase endpoints — auth guard", () => {
  let nonHrUserId: number;
  let nonHrRoleId: number;

  beforeAll(async () => {
    // A role with only self-service access — no hr:access, no sysadmin
    nonHrRoleId = await createTestRole(["view_own_profile"]);
    nonHrUserId = await createTestUser(nonHrRoleId);
  });

  afterAll(async () => {
    await cleanupUser(nonHrUserId);
    await cleanupRole(nonHrRoleId);
  });

  it("GET /api/onboarding/passphrase-status returns 403 for non-HR user", async () => {
    // buildApp injects nonHrUserId into req.session so requirePermission can
    // look up permissions — no real login flow needed.
    const api = buildApp(onboardingRouter, nonHrUserId);
    const res = await api.get("/api/onboarding/passphrase-status");
    expect(res.status).toBe(403);
  });

  it("PATCH /api/onboarding/passphrase returns 403 for non-HR user", async () => {
    const api = buildApp(onboardingRouter, nonHrUserId);
    const res = await api
      .patch("/api/onboarding/passphrase")
      .send({ passphrase: "newpassword123", confirm: "newpassword123" });
    expect(res.status).toBe(403);
  });
});

// ── Extended data copy — full submission ──────────────────────────────────────
// Submits a full wizard payload (address, next-of-kin, medical, disclosure with
// Update Service consent), approves it, then asserts every row was copied to the
// appropriate employee table.

describe("copySubmissionExtendedData — full submission with all sections", () => {
  let submissionId: number;
  let createdEmployeeId: number | null = null;

  beforeAll(async () => {
    // Insert a pending submission
    const [sub] = await db
      .insert(onboardingSubmissionsTable)
      .values({
        firstName: "FullCopy",
        lastName: `Test${Date.now()}`,
        email: `full-copy-${Date.now()}@example-test.invalid`,
        jobTitle: "Tester",
        employmentType: "full_time",
        startDate: "2025-06-01",
        onboardingStatus: "pending",
      })
      .returning({ id: onboardingSubmissionsTable.id });
    submissionId = sub.id;

    // Stage address
    await db.insert(onboardingAddressesTable).values({
      submissionId,
      line1: "123 Test Street",
      city: "Testville",
      postcode: "TE1 1ST",
      country: "GB",
    });

    // Stage next of kin + phone
    const [kin] = await db
      .insert(onboardingNextOfKinTable)
      .values({
        submissionId,
        name: "Jane Doe",
        relationship: "Spouse",
      })
      .returning({ id: onboardingNextOfKinTable.id });

    await db.insert(onboardingNextOfKinPhonesTable).values({
      kinId: kin.id,
      number: "07700900000",
      label: "Mobile",
      isPrimary: true,
    });

    // Stage medical
    await db.insert(onboardingMedicalTable).values({
      submissionId,
      medicalSelections: ["diabetes"],
      medicalNotes: "Type 2",
      dietarySelections: ["vegetarian"],
      dietaryNotes: null,
    });

    // Stage disclosure with Update Service consent
    await db.insert(onboardingDisclosuresTable).values({
      submissionId,
      checkType: "dbs",
      checkLevel: "enhanced",
      certificateNumber: "123456789",
      issueDate: "2024-01-15",
      onUpdateService: true,
      updateServiceConsentName: "FullCopy Test",
    });
  });

  afterAll(async () => {
    if (createdEmployeeId) {
      await cleanupEmployee(createdEmployeeId);
    } else {
      await db
        .delete(onboardingSubmissionsTable)
        .where(eq(onboardingSubmissionsTable.id, submissionId));
    }
  });

  it("approves the submission successfully", async () => {
    const api = buildApp(onboardingRouter, hrUserId);
    const res = await api
      .post(`/api/onboarding/submissions/${submissionId}/approve`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("employeeId");
    createdEmployeeId = res.body.employeeId;
  });

  it("copies the address row into employee_addresses", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const rows = await db
      .select()
      .from(employeeAddressesTable)
      .where(eq(employeeAddressesTable.employeeId, createdEmployeeId!));
    expect(rows).toHaveLength(1);
    expect(rows[0].line1).toBe("123 Test Street");
    expect(rows[0].city).toBe("Testville");
    expect(rows[0].postcode).toBe("TE1 1ST");
  });

  it("copies the next-of-kin row into employee_next_of_kin", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const rows = await db
      .select()
      .from(employeeNextOfKinTable)
      .where(eq(employeeNextOfKinTable.employeeId, createdEmployeeId!));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Jane Doe");
    expect(rows[0].relationship).toBe("Spouse");
  });

  it("copies the next-of-kin phone into employee_next_of_kin_phones", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const [kin] = await db
      .select({ id: employeeNextOfKinTable.id })
      .from(employeeNextOfKinTable)
      .where(eq(employeeNextOfKinTable.employeeId, createdEmployeeId!))
      .limit(1);
    expect(kin).toBeDefined();

    const phones = await db
      .select()
      .from(employeeNextOfKinPhonesTable)
      .where(eq(employeeNextOfKinPhonesTable.kinId, kin.id));
    expect(phones).toHaveLength(1);
    expect(phones[0].number).toBe("07700900000");
  });

  it("copies medical selections into employee_medical_selections", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const rows = await db
      .select()
      .from(employeeMedicalSelectionsTable)
      .where(eq(employeeMedicalSelectionsTable.employeeId, createdEmployeeId!));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.lovValue)).toContain("diabetes");
  });

  it("copies the disclosure row into employee_disclosures", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const rows = await db
      .select()
      .from(employeeDisclosuresTable)
      .where(eq(employeeDisclosuresTable.employeeId, createdEmployeeId!));
    expect(rows).toHaveLength(1);
    expect(rows[0].checkType).toBe("dbs");
    expect(rows[0].checkLevel).toBe("enhanced");
    expect(rows[0].onUpdateService).toBe(true);
  });

  it("writes an employee_disclosure_update_service_consents row with consent_granted=true", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const rows = await db
      .select()
      .from(employeeDisclosureConsentsTable)
      .where(eq(employeeDisclosureConsentsTable.employeeId, createdEmployeeId!));
    expect(rows).toHaveLength(1);
    expect(rows[0].consentGranted).toBe(true);
    expect(rows[0].signatoryName).toBe("FullCopy Test");
    expect(rows[0].disclosureId).not.toBeNull();
  });
});

// ── Extended data copy — partial submission (no disclosure) ───────────────────
// Verifies that a submission without a disclosure section approves cleanly and
// leaves the disclosure and consent tables empty for that employee.

describe("copySubmissionExtendedData — partial submission without disclosure", () => {
  let submissionId: number;
  let createdEmployeeId: number | null = null;

  beforeAll(async () => {
    const [sub] = await db
      .insert(onboardingSubmissionsTable)
      .values({
        firstName: "NoDisclosure",
        lastName: `Test${Date.now()}`,
        email: `no-disclosure-${Date.now()}@example-test.invalid`,
        jobTitle: "Tester",
        employmentType: "part_time",
        startDate: "2025-07-01",
        onboardingStatus: "pending",
      })
      .returning({ id: onboardingSubmissionsTable.id });
    submissionId = sub.id;

    // Stage address only — no disclosure, no kin, no medical
    await db.insert(onboardingAddressesTable).values({
      submissionId,
      line1: "99 Partial Lane",
      city: "Anytown",
    });
  });

  afterAll(async () => {
    if (createdEmployeeId) {
      await cleanupEmployee(createdEmployeeId);
    } else {
      await db
        .delete(onboardingSubmissionsTable)
        .where(eq(onboardingSubmissionsTable.id, submissionId));
    }
  });

  it("approves the partial submission successfully", async () => {
    const api = buildApp(onboardingRouter, hrUserId);
    const res = await api
      .post(`/api/onboarding/submissions/${submissionId}/approve`)
      .send({});
    expect(res.status).toBe(201);
    createdEmployeeId = res.body.employeeId;
  });

  it("copies the address row correctly", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const rows = await db
      .select()
      .from(employeeAddressesTable)
      .where(eq(employeeAddressesTable.employeeId, createdEmployeeId!));
    expect(rows).toHaveLength(1);
    expect(rows[0].line1).toBe("99 Partial Lane");
  });

  it("has no employee_disclosures rows for this employee", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const rows = await db
      .select()
      .from(employeeDisclosuresTable)
      .where(eq(employeeDisclosuresTable.employeeId, createdEmployeeId!));
    expect(rows).toHaveLength(0);
  });

  it("has no employee_disclosure_update_service_consents rows for this employee", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const rows = await db
      .select()
      .from(employeeDisclosureConsentsTable)
      .where(eq(employeeDisclosureConsentsTable.employeeId, createdEmployeeId!));
    expect(rows).toHaveLength(0);
  });

  it("has no employee_next_of_kin rows for this employee", async () => {
    expect(createdEmployeeId).not.toBeNull();
    const rows = await db
      .select()
      .from(employeeNextOfKinTable)
      .where(eq(employeeNextOfKinTable.employeeId, createdEmployeeId!));
    expect(rows).toHaveLength(0);
  });
});
