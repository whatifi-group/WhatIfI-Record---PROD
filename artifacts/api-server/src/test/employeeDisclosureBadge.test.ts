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
import { eq } from "drizzle-orm";
import { db, employeeDisclosuresTable, employeeDisclosureReviewsTable } from "@workspace/db";
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

// ── True-case integration tests ───────────────────────────────────────────────

describe("GET /api/employees — pendingDisclosureReview: conviction with no review", () => {
  let disclosureId: number;

  beforeAll(async () => {
    const [disc] = await db
      .insert(employeeDisclosuresTable)
      .values({
        employeeId: empId,
        checkType: "dbs",
        checkLevel: "enhanced",
        issueDate: "2024-01-01",
        convictionDetails: "Minor offence disclosed on application",
      })
      .returning({ id: employeeDisclosuresTable.id });
    disclosureId = disc.id;
  });

  afterAll(async () => {
    await db
      .delete(employeeDisclosuresTable)
      .where(eq(employeeDisclosuresTable.id, disclosureId));
  });

  it("pendingDisclosureReview is true for a view_disclosures user", async () => {
    const res = await buildApp(router, disclosureUserId).get("/api/employees");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp).toBeDefined();
    expect(emp.pendingDisclosureReview).toBe(true);
  });
});

describe("GET /api/employees — pendingDisclosureReview: conviction with signed-off review", () => {
  let disclosureId: number;

  beforeAll(async () => {
    const [disc] = await db
      .insert(employeeDisclosuresTable)
      .values({
        employeeId: empId,
        checkType: "dbs",
        checkLevel: "enhanced",
        issueDate: "2024-01-01",
        convictionDetails: "Minor offence disclosed on application",
      })
      .returning({ id: employeeDisclosuresTable.id });
    disclosureId = disc.id;

    await db.insert(employeeDisclosureReviewsTable).values({
      disclosureId: disc.id,
      recommendation: "approved",
      reviewDate: "2024-06-01",
      signedOffAt: new Date("2024-06-02T10:00:00Z"),
    });
  });

  afterAll(async () => {
    // Cascade delete removes the review row too
    await db
      .delete(employeeDisclosuresTable)
      .where(eq(employeeDisclosuresTable.id, disclosureId));
  });

  it("pendingDisclosureReview is false when the review has been signed off", async () => {
    const res = await buildApp(router, disclosureUserId).get("/api/employees");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp).toBeDefined();
    expect(emp.pendingDisclosureReview).toBe(false);
  });
});

describe("GET /api/employees — pendingDisclosureReview: disclosure with no conviction details", () => {
  let disclosureId: number;

  beforeAll(async () => {
    const [disc] = await db
      .insert(employeeDisclosuresTable)
      .values({
        employeeId: empId,
        checkType: "dbs",
        checkLevel: "standard",
        issueDate: "2024-01-01",
        convictionDetails: null,
      })
      .returning({ id: employeeDisclosuresTable.id });
    disclosureId = disc.id;
  });

  afterAll(async () => {
    await db
      .delete(employeeDisclosuresTable)
      .where(eq(employeeDisclosuresTable.id, disclosureId));
  });

  it("pendingDisclosureReview is false when convictionDetails is null", async () => {
    const res = await buildApp(router, disclosureUserId).get("/api/employees");
    expect(res.status).toBe(200);
    const emp = res.body.find((e: { id: number }) => e.id === empId);
    expect(emp).toBeDefined();
    expect(emp.pendingDisclosureReview).toBe(false);
  });
});
