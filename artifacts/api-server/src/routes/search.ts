import { Router, type IRouter } from "express";
import { ilike, or, ne, sql } from "drizzle-orm";
import {
  db,
  employeesTable,
  departmentsTable,
  leaveRequestsTable,
  usersTable,
  qualificationTypesTable,
} from "@workspace/db";

const router: IRouter = Router();

const LIMIT_PER_CATEGORY = 5;

// GET /api/search?q=
router.get("/search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (q.length < 2) {
    res.json({ results: [] });
    return;
  }

  const perms = req.effectivePermissions ?? new Set<string>();
  const isSysadmin = perms.has("sysadmin");
  const hasHrAccess = perms.has("hr:access") || isSysadmin;
  const hasPastEmployees = perms.has("hr:past_employees") || isSysadmin;

  const term = `%${q}%`;
  const results: Array<{
    type: string;
    id: number;
    label: string;
    sublabel: string | null;
    href: string;
  }> = [];

  // ── Employees ──────────────────────────────────────────────────────────
  if (hasHrAccess) {
    const empRows = await db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
        email: employeesTable.email,
        jobTitle: employeesTable.jobTitle,
        status: employeesTable.status,
      })
      .from(employeesTable)
      .where(
        or(
          ilike(employeesTable.firstName, term),
          ilike(employeesTable.lastName, term),
          ilike(employeesTable.email, term),
          ilike(employeesTable.jobTitle, term),
          // full-name match: "John Smith"
          ilike(sql`${employeesTable.firstName} || ' ' || ${employeesTable.lastName}`, term),
        ),
      )
      .limit(hasPastEmployees ? LIMIT_PER_CATEGORY : LIMIT_PER_CATEGORY + 10) // fetch more so we can filter
      ;

    const filtered = hasPastEmployees
      ? empRows
      : empRows.filter((r) => r.status !== "leaver");

    filtered.slice(0, LIMIT_PER_CATEGORY).forEach((r) => {
      results.push({
        type: "employee",
        id: r.id,
        label: `${r.firstName} ${r.lastName}`,
        sublabel: r.jobTitle,
        href: `/employees/${r.id}`,
      });
    });
  }

  // ── Departments ────────────────────────────────────────────────────────
  if (hasHrAccess) {
    const deptRows = await db
      .select({ id: departmentsTable.id, name: departmentsTable.name })
      .from(departmentsTable)
      .where(ilike(departmentsTable.name, term))
      .limit(LIMIT_PER_CATEGORY);

    deptRows.forEach((r) => {
      results.push({
        type: "department",
        id: r.id,
        label: r.name,
        sublabel: "Department",
        href: `/departments`,
      });
    });
  }

  // ── Leave Requests ─────────────────────────────────────────────────────
  if (hasHrAccess) {
    const leaveRows = await db
      .select({
        id: leaveRequestsTable.id,
        reason: leaveRequestsTable.reason,
        type: leaveRequestsTable.type,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
      })
      .from(leaveRequestsTable)
      .leftJoin(employeesTable, sql`${leaveRequestsTable.employeeId} = ${employeesTable.id}`)
      .where(
        or(
          ilike(leaveRequestsTable.reason, term),
          ilike(employeesTable.firstName, term),
          ilike(employeesTable.lastName, term),
          ilike(sql`${employeesTable.firstName} || ' ' || ${employeesTable.lastName}`, term),
        ),
      )
      .limit(LIMIT_PER_CATEGORY);

    leaveRows.forEach((r) => {
      results.push({
        type: "leave_request",
        id: r.id,
        label: r.firstName && r.lastName ? `${r.firstName} ${r.lastName}` : `Leave #${r.id}`,
        sublabel: r.reason ?? r.type,
        href: `/leave`,
      });
    });
  }

  // ── Users (sysadmin only) ──────────────────────────────────────────────
  if (isSysadmin) {
    const userRows = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(
        or(
          ilike(usersTable.name, term),
          ilike(usersTable.email, term),
        ),
      )
      .limit(LIMIT_PER_CATEGORY);

    userRows.forEach((r) => {
      results.push({
        type: "user",
        id: r.id,
        label: r.name,
        sublabel: r.email,
        href: `/sysadmin/users`,
      });
    });
  }

  // ── Qualification Types (sysadmin only) ────────────────────────────────
  if (isSysadmin) {
    const qtRows = await db
      .select({ id: qualificationTypesTable.id, name: qualificationTypesTable.name, awardingBody: qualificationTypesTable.awardingBody })
      .from(qualificationTypesTable)
      .where(ilike(qualificationTypesTable.name, term))
      .limit(LIMIT_PER_CATEGORY);

    qtRows.forEach((r) => {
      results.push({
        type: "qualification_type",
        id: r.id,
        label: r.name,
        sublabel: r.awardingBody ?? "Qualification Type",
        href: `/sysadmin/qualification-types`,
      });
    });
  }

  res.json({ results });
});

export default router;
