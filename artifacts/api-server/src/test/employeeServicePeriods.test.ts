/**
 * Task #131 — Service periods: overlap validation + leaver/re-activation sync.
 *
 * Covers:
 *  - POST /employees/:id/service-periods rejects overlapping periods (400)
 *  - PUT /employees/:id/service-periods/:id rejects updates that would create overlap (400)
 *  - Marking an employee as leaver closes their open service period
 *  - Re-activating an employee opens a new service period + re-enables user account
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import hrRouter from "../routes/hr/index";
import {
  buildApp,
  cleanupEmployee,
  cleanupRole,
  cleanupUser,
  createTestRole,
  createTestUser,
} from "./helpers";
import { db, employeeServicePeriodsTable, employeesTable, usersTable, userRolesTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

// ── File-level fixtures ───────────────────────────────────────────────────────

/** A user with edit_employees + sysadmin so PATCH /employees/:id is allowed. */
let editorRoleId: number;
let editorUserId: number;

/** Employee used purely for overlap validation tests (no linked user needed). */
let empAId: number;
/** The seed service period [2023-01-01 → 2023-06-30] that other periods can overlap. */
let seedPeriodId: number;

/** Employee used for leaver/re-activation tests (needs a linked user). */
let empBId: number;
let empBUserId: number;

beforeAll(async () => {
  editorRoleId = await createTestRole(["edit_employees", "sysadmin"]);
  editorUserId = await createTestUser(editorRoleId);

  // empA — overlap tests
  const [empA] = await db
    .insert(employeesTable)
    .values({
      firstName: "Overlap",
      lastName: "TestA",
      email: `overlap-test-a-${Date.now()}@example-test.invalid`,
      jobTitle: "Tester",
      employmentType: "full_time",
      startDate: "2020-01-01",
    })
    .returning({ id: employeesTable.id });
  empAId = empA.id;

  const [seedPeriod] = await db
    .insert(employeeServicePeriodsTable)
    .values({ employeeId: empAId, startDate: "2023-01-01", endDate: "2023-06-30" })
    .returning({ id: employeeServicePeriodsTable.id });
  seedPeriodId = seedPeriod.id;

  // empB — leaver/re-activation tests (with a linked user + open service period)
  const [empB] = await db
    .insert(employeesTable)
    .values({
      firstName: "Leaver",
      lastName: "TestB",
      email: `leaver-test-b-${Date.now()}@example-test.invalid`,
      jobTitle: "Tester",
      employmentType: "full_time",
      startDate: "2020-01-01",
      status: "active",
    })
    .returning({ id: employeesTable.id });
  empBId = empB.id;

  const [empBUser] = await db
    .insert(usersTable)
    .values({
      name: "Leaver TestB",
      email: `leaver-user-b-${Date.now()}@example-test.invalid`,
      passwordHash: "not-a-real-hash",
      permissions: [],
      employeeId: empBId,
      status: "active",
    })
    .returning({ id: usersTable.id });
  empBUserId = empBUser.id;
  await db.insert(userRolesTable).values({ userId: empBUserId, roleId: editorRoleId });

  await db
    .insert(employeeServicePeriodsTable)
    .values({ employeeId: empBId, startDate: "2020-01-01", endDate: null });
});

afterAll(async () => {
  await cleanupEmployee(empAId); // cascades service periods
  await cleanupEmployee(empBId); // cascades service periods + linked user
  await cleanupUser(editorUserId);
  await cleanupRole(editorRoleId);
});

// ── POST overlap validation ───────────────────────────────────────────────────

describe("POST /api/employees/:id/service-periods — overlap validation", () => {
  it("accepts a period that does not overlap the seed period (immediately after)", async () => {
    const api = buildApp(hrRouter, editorUserId);
    const res = await api
      .post(`/api/employees/${empAId}/service-periods`)
      .send({ startDate: "2023-07-01", endDate: "2023-12-31" });
    expect(res.status).toBe(201);
    // Clean up the created period so later tests start from a known state
    await db
      .delete(employeeServicePeriodsTable)
      .where(eq(employeeServicePeriodsTable.id, res.body.id));
  });

  it("rejects a period whose range overlaps the middle of the seed period", async () => {
    const api = buildApp(hrRouter, editorUserId);
    const res = await api
      .post(`/api/employees/${empAId}/service-periods`)
      .send({ startDate: "2023-03-01", endDate: "2023-09-01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/overlap/i);
  });

  it("rejects a new open-ended period whose start falls inside the seed period", async () => {
    const api = buildApp(hrRouter, editorUserId);
    const res = await api
      .post(`/api/employees/${empAId}/service-periods`)
      .send({ startDate: "2023-05-01" }); // open-ended, starts inside [2023-01-01, 2023-06-30]
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/overlap/i);
  });

  it("rejects a closed period that completely contains the seed period", async () => {
    const api = buildApp(hrRouter, editorUserId);
    const res = await api
      .post(`/api/employees/${empAId}/service-periods`)
      .send({ startDate: "2022-01-01", endDate: "2024-01-01" });
    expect(res.status).toBe(400);
  });

  it("rejects a new period that overlaps an existing open-ended period", async () => {
    // Insert a temporary open-ended period [2025-01-01, null]
    const [openPeriod] = await db
      .insert(employeeServicePeriodsTable)
      .values({ employeeId: empAId, startDate: "2025-01-01", endDate: null })
      .returning({ id: employeeServicePeriodsTable.id });

    try {
      const api = buildApp(hrRouter, editorUserId);
      const res = await api
        .post(`/api/employees/${empAId}/service-periods`)
        .send({ startDate: "2025-06-01", endDate: "2025-12-31" }); // inside the open period
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/overlap/i);
    } finally {
      await db
        .delete(employeeServicePeriodsTable)
        .where(eq(employeeServicePeriodsTable.id, openPeriod.id));
    }
  });
});

// ── PUT overlap validation ────────────────────────────────────────────────────

describe("PUT /api/employees/:id/service-periods/:periodId — overlap validation", () => {
  /** A second closed period [2023-07-01, 2023-12-31] that sits after the seed. */
  let periodBId: number;

  beforeAll(async () => {
    const [p] = await db
      .insert(employeeServicePeriodsTable)
      .values({ employeeId: empAId, startDate: "2023-07-01", endDate: "2023-12-31" })
      .returning({ id: employeeServicePeriodsTable.id });
    periodBId = p.id;
  });

  afterAll(async () => {
    await db
      .delete(employeeServicePeriodsTable)
      .where(eq(employeeServicePeriodsTable.id, periodBId));
  });

  it("rejects a startDate change that would push period B into period A (seed)", async () => {
    // Seed: [2023-01-01, 2023-06-30], Period B: [2023-07-01, 2023-12-31]
    // Moving B's start to 2023-05-01 would overlap the seed period.
    const api = buildApp(hrRouter, editorUserId);
    const res = await api
      .put(`/api/employees/${empAId}/service-periods/${periodBId}`)
      .send({ startDate: "2023-05-01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/overlap/i);
  });

  it("allows updating notes on period B without triggering self-overlap", async () => {
    const api = buildApp(hrRouter, editorUserId);
    const res = await api
      .put(`/api/employees/${empAId}/service-periods/${periodBId}`)
      .send({ notes: "No date change — should succeed" });
    expect(res.status).toBe(200);
  });

  it("allows extending period B's endDate when no other period exists after it", async () => {
    const api = buildApp(hrRouter, editorUserId);
    const res = await api
      .put(`/api/employees/${empAId}/service-periods/${periodBId}`)
      .send({ endDate: "2024-06-30" }); // extends into 2024 — no overlap
    expect(res.status).toBe(200);
    // Restore for cleanup consistency
    await db
      .update(employeeServicePeriodsTable)
      .set({ endDate: "2023-12-31" })
      .where(eq(employeeServicePeriodsTable.id, periodBId));
  });
});

// ── Leaver: closes open service period ───────────────────────────────────────

describe("PATCH /api/employees/:id — marking as leaver closes the open service period", () => {
  it("sets endDate on the open service period when employee is marked as leaver", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const api = buildApp(hrRouter, editorUserId);
    const res = await api
      .patch(`/api/employees/${empBId}`)
      .send({ status: "leaver", leaverReason: "resignation" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("leaver");

    // Verify the previously-open service period is now closed with today's date
    const periods = await db
      .select()
      .from(employeeServicePeriodsTable)
      .where(eq(employeeServicePeriodsTable.employeeId, empBId));

    const openPeriods = periods.filter((p) => p.endDate === null);
    expect(openPeriods).toHaveLength(0);

    const closedPeriod = periods.find((p) => p.startDate === "2020-01-01");
    expect(closedPeriod).toBeDefined();
    expect(closedPeriod!.endDate).toBe(today);
  });

  it("suspends the linked user account when employee is marked as leaver", async () => {
    const [user] = await db
      .select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, empBUserId));
    expect(user.status).toBe("suspended");
  });
});

// ── Re-activation: opens new service period + re-enables user ─────────────────

describe("PATCH /api/employees/:id — re-activating from leaver opens a service period and re-enables user", () => {
  it("inserts a new open service period with startDate = today when re-activating", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const api = buildApp(hrRouter, editorUserId);
    const res = await api
      .patch(`/api/employees/${empBId}`)
      .send({ status: "active" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");

    // There should now be exactly one open service period starting today
    const openPeriods = await db
      .select()
      .from(employeeServicePeriodsTable)
      .where(
        and(
          eq(employeeServicePeriodsTable.employeeId, empBId),
          isNull(employeeServicePeriodsTable.endDate),
        ),
      );
    expect(openPeriods).toHaveLength(1);
    expect(openPeriods[0].startDate).toBe(today);
  });

  it("re-enables the linked user account when re-activating", async () => {
    const [user] = await db
      .select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, empBUserId));
    expect(user.status).toBe("active");
  });
});

// ── Two back-to-back leaver/re-activation cycles ──────────────────────────────

describe("PATCH /api/employees/:id — two complete leaver/re-activation cycles", () => {
  let empCId: number;
  let empCUserId: number;

  beforeAll(async () => {
    const [empC] = await db
      .insert(employeesTable)
      .values({
        firstName: "Cycle",
        lastName: "TestC",
        email: `cycle-test-c-${Date.now()}@example-test.invalid`,
        jobTitle: "Tester",
        employmentType: "full_time",
        startDate: "2020-01-01",
        status: "active",
      })
      .returning({ id: employeesTable.id });
    empCId = empC.id;

    const [empCUser] = await db
      .insert(usersTable)
      .values({
        name: "Cycle TestC",
        email: `cycle-user-c-${Date.now()}@example-test.invalid`,
        passwordHash: "not-a-real-hash",
        permissions: [],
        employeeId: empCId,
        status: "active",
      })
      .returning({ id: usersTable.id });
    empCUserId = empCUser.id;
    await db.insert(userRolesTable).values({ userId: empCUserId, roleId: editorRoleId });

    // Initial open service period
    await db
      .insert(employeeServicePeriodsTable)
      .values({ employeeId: empCId, startDate: "2020-01-01", endDate: null });
  });

  afterAll(async () => {
    await cleanupEmployee(empCId); // cascades service periods + linked user
  });

  /** Returns all service periods for empC ordered by startDate. */
  async function getPeriods() {
    return db
      .select()
      .from(employeeServicePeriodsTable)
      .where(eq(employeeServicePeriodsTable.employeeId, empCId))
      .orderBy(employeeServicePeriodsTable.startDate);
  }

  /** Asserts no two periods have overlapping date ranges. */
  function assertNoOverlaps(
    periods: Array<{ startDate: string; endDate: string | null }>,
  ) {
    for (let i = 0; i < periods.length - 1; i++) {
      const a = periods[i];
      const b = periods[i + 1];
      // a must be closed and its endDate must be before b's startDate
      expect(a.endDate).not.toBeNull();
      expect(a.endDate! <= b.startDate).toBe(true);
    }
  }

  // ── Cycle 1: leaver ────────────────────────────────────────────────────────

  it("cycle 1 — marking as leaver closes the open period and leaves 0 open periods", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const api = buildApp(hrRouter, editorUserId);

    const res = await api
      .patch(`/api/employees/${empCId}`)
      .send({ status: "leaver", leaverReason: "resignation" });
    expect(res.status).toBe(200);

    const periods = await getPeriods();
    const open = periods.filter((p) => p.endDate === null);
    const closed = periods.filter((p) => p.endDate !== null);

    expect(open).toHaveLength(0);
    expect(closed).toHaveLength(1);
    expect(closed[0].endDate).toBe(today);
    assertNoOverlaps(periods);
  });

  it("cycle 1 — leaver suspends the linked user account", async () => {
    const [user] = await db
      .select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, empCUserId));
    expect(user.status).toBe("suspended");
  });

  // ── Cycle 1: re-activation ─────────────────────────────────────────────────

  it("cycle 1 — re-activating opens a new period; result is 1 closed + 1 open, no overlap", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const api = buildApp(hrRouter, editorUserId);

    const res = await api
      .patch(`/api/employees/${empCId}`)
      .send({ status: "active" });
    expect(res.status).toBe(200);

    const periods = await getPeriods();
    const open = periods.filter((p) => p.endDate === null);
    const closed = periods.filter((p) => p.endDate !== null);

    expect(closed).toHaveLength(1);
    expect(open).toHaveLength(1);
    expect(open[0].startDate).toBe(today);
    assertNoOverlaps(periods);
  });

  it("cycle 1 — re-activation re-enables the linked user account", async () => {
    const [user] = await db
      .select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, empCUserId));
    expect(user.status).toBe("active");
  });

  // ── Cycle 2: leaver ────────────────────────────────────────────────────────

  it("cycle 2 — marking as leaver again closes the second period; result is 2 closed, 0 open", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const api = buildApp(hrRouter, editorUserId);

    const res = await api
      .patch(`/api/employees/${empCId}`)
      .send({ status: "leaver", leaverReason: "contract_end" });
    expect(res.status).toBe(200);

    const periods = await getPeriods();
    const open = periods.filter((p) => p.endDate === null);
    const closed = periods.filter((p) => p.endDate !== null);

    expect(open).toHaveLength(0);
    expect(closed).toHaveLength(2);
    // Both closed periods must not overlap each other
    assertNoOverlaps(periods);
    // The most recently closed period ends today
    expect(closed[1].endDate).toBe(today);
  });

  it("cycle 2 — second leaver transition suspends the user account again", async () => {
    const [user] = await db
      .select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, empCUserId));
    expect(user.status).toBe("suspended");
  });

  // ── Cycle 2: re-activation ─────────────────────────────────────────────────

  it("cycle 2 — second re-activation opens a third period; result is 2 closed + 1 open, no overlap", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const api = buildApp(hrRouter, editorUserId);

    const res = await api
      .patch(`/api/employees/${empCId}`)
      .send({ status: "active" });
    expect(res.status).toBe(200);

    const periods = await getPeriods();
    const open = periods.filter((p) => p.endDate === null);
    const closed = periods.filter((p) => p.endDate !== null);

    expect(closed).toHaveLength(2);
    expect(open).toHaveLength(1);
    expect(open[0].startDate).toBe(today);
    // All three periods must not overlap
    assertNoOverlaps(periods);
  });

  it("cycle 2 — second re-activation re-enables the user account", async () => {
    const [user] = await db
      .select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, empCUserId));
    expect(user.status).toBe("active");
  });

  // ── Final state sanity check ───────────────────────────────────────────────

  it("final state — exactly 3 service periods total, exactly 1 open, no phantom open periods", async () => {
    const periods = await getPeriods();
    expect(periods).toHaveLength(3);
    const open = periods.filter((p) => p.endDate === null);
    expect(open).toHaveLength(1);
    assertNoOverlaps(periods);
  });
});
