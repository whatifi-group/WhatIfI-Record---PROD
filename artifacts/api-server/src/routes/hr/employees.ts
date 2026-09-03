import { Router, type IRouter } from "express";
import { and, eq, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db, departmentsTable, employeeDepartmentsTable, employeeDisclosuresTable, employeeDisclosureReviewsTable, employeePayRatesTable, employeePhonesTable, employeeServicePeriodsTable, employeesTable, rolesTable, usersTable, userRolesTable } from "@workspace/db";
import {
  requirePermission,
  invalidatePermissionsCache,
  getEffectivePermissions,
} from "../../middlewares/requirePermission";
import { syncOnboardingSubmission } from "../../lib/onboardingSync";
import {
  CreateEmployeeBody,
  UpdateEmployeeBody,
  GetEmployeeParams,
  UpdateEmployeeParams,
  DeleteEmployeeParams,
  ListEmployeesQueryParams,
  ListEmployeesResponse,
  GetEmployeeResponse,
  CreateEmployeeResponse,
  UpdateEmployeeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function employeeSelection() {
  return db
    .select({
      id: employeesTable.id,
      firstName: employeesTable.firstName,
      lastName: employeesTable.lastName,
      email: employeesTable.email,
      jobTitle: employeesTable.jobTitle,
      employmentType: employeesTable.employmentType,
      status: employeesTable.status,
      startDate: employeesTable.startDate,
      salary: sql<number | null>`${employeesTable.salary}::float8`,
      avatarUrl: employeesTable.avatarUrl,
      leaverReason: employeesTable.leaverReason,
      leaverDate: employeesTable.leaverDate,
      createdAt: employeesTable.createdAt,
    })
    .from(employeesTable);
}

/** Fetch phones for a single employee. */
async function getEmployeePhones(employeeId: number) {
  return db
    .select({
      id: employeePhonesTable.id,
      number: employeePhonesTable.number,
      label: employeePhonesTable.label,
      isPrimary: employeePhonesTable.isPrimary,
    })
    .from(employeePhonesTable)
    .where(eq(employeePhonesTable.employeeId, employeeId))
    .orderBy(employeePhonesTable.createdAt);
}

/** Attach the assigned departments (id + name) to a batch of employee rows. */
async function attachDepartments<T extends { id: number }>(
  rows: T[],
): Promise<(T & { departments: { id: number; name: string }[] })[]> {
  if (rows.length === 0) return [];

  const links = await db
    .select({
      employeeId: employeeDepartmentsTable.employeeId,
      id: departmentsTable.id,
      name: departmentsTable.name,
    })
    .from(employeeDepartmentsTable)
    .innerJoin(departmentsTable, eq(employeeDepartmentsTable.departmentId, departmentsTable.id))
    .where(
      inArray(
        employeeDepartmentsTable.employeeId,
        rows.map((r) => r.id),
      ),
    );

  const byEmployee = new Map<number, { id: number; name: string }[]>();
  for (const link of links) {
    byEmployee.set(link.employeeId, [
      ...(byEmployee.get(link.employeeId) ?? []),
      { id: link.id, name: link.name },
    ]);
  }

  return rows.map((r) => ({ ...r, departments: byEmployee.get(r.id) ?? [] }));
}


router.get("/employees", requirePermission(["view_employees", "edit_employees", "sysadmin"]), async (req, res): Promise<void> => {
  const query = ListEmployeesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  // Viewing leavers is gated separately from ordinary employee visibility —
  // e.g. Senior Manager has view_employees but not hr:past_employees.
  if (query.data.status === "leaver") {
    const perms = req.effectivePermissions
      ?? (req.session?.userId ? await getEffectivePermissions(req.session.userId) : new Set<string>());
    if (!perms.has("hr:past_employees") && !perms.has("sysadmin")) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const conditions: SQL[] = [];
  if (query.data.search) {
    const term = `%${query.data.search}%`;
    conditions.push(
      or(
        ilike(employeesTable.firstName, term),
        ilike(employeesTable.lastName, term),
        ilike(employeesTable.email, term),
        ilike(employeesTable.jobTitle, term),
      )!,
    );
  }
  if (query.data.departmentIds) {
    const departmentIds = query.data.departmentIds
      .split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    if (departmentIds.length > 0) {
      conditions.push(
        inArray(
          employeesTable.id,
          db
            .select({ id: employeeDepartmentsTable.employeeId })
            .from(employeeDepartmentsTable)
            .where(inArray(employeeDepartmentsTable.departmentId, departmentIds)),
        ),
      );
    }
  }
  if (query.data.status) {
    conditions.push(eq(employeesTable.status, query.data.status));
  }

  const base = employeeSelection();
  const rows = await (conditions.length > 0
    ? base.where(and(...conditions))
    : base
  ).orderBy(employeesTable.lastName, employeesTable.firstName);

  // Compute pending disclosure review flags — only for users with view_disclosures or sysadmin
  const userId = req.session?.userId;
  let pendingMap = new Map<number, boolean>();
  if (userId) {
    try {
      const perms = req.effectivePermissions ?? await getEffectivePermissions(userId);
      if (perms.has("view_disclosures") || perms.has("sysadmin")) {
        const pending = await db
          .selectDistinct({ employeeId: employeeDisclosuresTable.employeeId })
          .from(employeeDisclosuresTable)
          .leftJoin(
            employeeDisclosureReviewsTable,
            eq(employeeDisclosureReviewsTable.disclosureId, employeeDisclosuresTable.id),
          )
          .where(
            and(
              isNotNull(employeeDisclosuresTable.convictionDetails),
              or(
                isNull(employeeDisclosureReviewsTable.id),
                isNull(employeeDisclosureReviewsTable.signedOffAt),
              ),
            ),
          );
        pending.forEach((p) => pendingMap.set(p.employeeId, true));
      }
    } catch (err) {
      console.error("pendingDisclosureReview query failed:", err);
      // non-fatal — badge silently omitted rather than breaking the employee list
    }
  }

  const rowsWithDepartments = await attachDepartments(rows);
  const responseRows = rowsWithDepartments.map((row) => ({
    ...row,
    pendingDisclosureReview: pendingMap.get(row.id) ?? false,
  }));

  res.json(ListEmployeesResponse.parse(responseRows));
});

router.post("/employees", requirePermission(["edit_employees", "sysadmin"]), async (req, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Check that the email is not already in use by an existing user account
  const existingUser = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email.toLowerCase()))
    .limit(1);

  if (existingUser.length > 0) {
    res.status(409).json({ error: "A user account with this email already exists" });
    return;
  }

  // Verify the requested roles exist
  const roles = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(inArray(rolesTable.id, parsed.data.userRoleIds));

  if (roles.length !== new Set(parsed.data.userRoleIds).size) {
    res.status(400).json({ error: "User role not found" });
    return;
  }

  const { userRoleIds, departmentIds, ...employeeData } = parsed.data;

  // Create employee + linked user (+ department/role assignments) in a single transaction
  const created = await db.transaction(async (tx) => {
    const [employee] = await tx
      .insert(employeesTable)
      .values({
        ...employeeData,
        startDate: toDateString(employeeData.startDate),
        salary: employeeData.salary != null ? String(employeeData.salary) : null,
      })
      .returning();

    if (departmentIds && departmentIds.length > 0) {
      await tx
        .insert(employeeDepartmentsTable)
        .values(departmentIds.map((departmentId) => ({ employeeId: employee.id, departmentId })));
    }

    const [user] = await tx
      .insert(usersTable)
      .values({
        name: `${employeeData.firstName} ${employeeData.lastName}`,
        email: employeeData.email.toLowerCase(),
        // No password: employee accounts sign in through Microsoft SSO, which
        // links this row on their first sign-in via the matching email.
        passwordHash: null,
        status: "active",
        permissions: [],
        isSystemAccount: false,
        employeeId: employee.id,
      })
      .returning();

    await tx
      .insert(userRolesTable)
      .values(userRoleIds.map((roleId) => ({ userId: user.id, roleId })));

    return employee;
  });

  const [row] = await employeeSelection().where(eq(employeesTable.id, created.id));
  const [withDepartments] = await attachDepartments([row]);
  const phones = await getEmployeePhones(created.id);
  res.status(201).json(CreateEmployeeResponse.parse({ ...withDepartments, phones }));
});

router.get("/employees/:id", requirePermission(["view_employees", "edit_employees", "sysadmin"]), async (req, res): Promise<void> => {
  const params = GetEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await employeeSelection().where(
    eq(employeesTable.id, params.data.id),
  );

  if (!row) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const [withDepartments] = await attachDepartments([row]);
  const phones = await getEmployeePhones(params.data.id);
  res.json(GetEmployeeResponse.parse({ ...withDepartments, phones }));
});

router.patch("/employees/:id", requirePermission(["edit_employees", "sysadmin"]), async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Enforce: leaverReason required when setting status to leaver
  if (parsed.data.status === "leaver" && !parsed.data.leaverReason) {
    res.status(400).json({ error: "leaverReason is required when setting status to leaver" });
    return;
  }

  // Enforce: when setting status to leaver, leaverDate must not be null or far-future
  if (parsed.data.status === "leaver") {
    if (parsed.data.leaverDate === null) {
      res.status(400).json({ error: "leaverDate cannot be blank when setting status to leaver" });
      return;
    }
    if (parsed.data.leaverDate !== undefined) {
      const maxFutureDate = new Date();
      maxFutureDate.setDate(maxFutureDate.getDate() + 30);
      if (toDateString(parsed.data.leaverDate as Date) > maxFutureDate.toISOString().slice(0, 10)) {
        res.status(400).json({ error: "leaverDate cannot be more than 30 days in the future" });
        return;
      }
    }
  }

  const { salary, startDate, leaverDate, departmentIds, ...rest } = parsed.data;
  const today = new Date().toISOString().slice(0, 10);

  // Pre-fetch current status so we can detect leaver ↔ active transitions for
  // service-period sync (done after the update below).
  const [currentEmployee] = await db
    .select({ status: employeesTable.status })
    .from(employeesTable)
    .where(eq(employeesTable.id, params.data.id))
    .limit(1);

  if (!currentEmployee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const [updated] = await db
    .update(employeesTable)
    .set({
      ...rest,
      ...(startDate !== undefined
        ? { startDate: toDateString(startDate) }
        : {}),
      ...(salary !== undefined
        ? { salary: salary != null ? String(salary) : null }
        : {}),
      // Explicit leaverDate from request
      ...(leaverDate !== undefined
        ? { leaverDate: leaverDate != null ? toDateString(leaverDate) : null }
        : {}),
      // Auto-set leaverDate to today if marking as leaver and caller omitted it
      ...(parsed.data.status === "leaver" && leaverDate === undefined
        ? { leaverDate: today }
        : {}),
    })
    .where(eq(employeesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  if (departmentIds) {
    await db.transaction(async (tx) => {
      await tx
        .delete(employeeDepartmentsTable)
        .where(eq(employeeDepartmentsTable.employeeId, updated.id));
      if (departmentIds.length > 0) {
        await tx
          .insert(employeeDepartmentsTable)
          .values(departmentIds.map((departmentId) => ({ employeeId: updated.id, departmentId })));
      }
    });
  }

  // When marking as leaver: suspend user account, close open service period,
  // and close all open pay rates with effectiveTo = leaving date.
  if (parsed.data.status === "leaver") {
    await db
      .update(usersTable)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(usersTable.employeeId, updated.id));

    const closingDate = updated.leaverDate ?? today;
    await db
      .update(employeeServicePeriodsTable)
      .set({
        endDate: closingDate,
        endReason: parsed.data.leaverReason ?? "leaver",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(employeeServicePeriodsTable.employeeId, updated.id),
          isNull(employeeServicePeriodsTable.endDate),
        ),
      );

    // Close open pay rates that have already started (effectiveFrom <= closingDate).
    // Future-dated rates (effectiveFrom > closingDate) are left untouched — setting
    // effectiveTo = closingDate on them would produce effectiveTo < effectiveFrom,
    // violating the pay-rate date invariant.
    // Re-hire does NOT auto-reopen closed rates — HR must create new ones manually.
    await db
      .update(employeePayRatesTable)
      .set({ effectiveTo: closingDate })
      .where(
        and(
          eq(employeePayRatesTable.employeeId, updated.id),
          isNull(employeePayRatesTable.effectiveTo),
          lte(employeePayRatesTable.effectiveFrom, closingDate),
        ),
      );
  }

  // When re-activating from leaver: open a new service period + re-enable user
  if (currentEmployee.status === "leaver" && parsed.data.status === "active") {
    await db.insert(employeeServicePeriodsTable).values({
      employeeId: updated.id,
      startDate: today,
      endDate: null,
    });

    await db
      .update(usersTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(usersTable.employeeId, updated.id));
  }

  const [row] = await employeeSelection().where(
    eq(employeesTable.id, updated.id),
  );
  const [withDepartments] = await attachDepartments([row]);
  const phones = await getEmployeePhones(updated.id);

  // Best-effort sync — keep the linked onboarding submission current.
  await syncOnboardingSubmission(updated.id).catch((err) => {
    console.error("onboarding sync failed after employee update:", err);
  });

  res.json(UpdateEmployeeResponse.parse({ ...withDepartments, phones }));
});

router.delete("/employees/:id", requirePermission("sysadmin"), async (req, res): Promise<void> => {
  const params = DeleteEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Resolve the linked user (if any) before deletion so we can evict their
  // cached permissions.  The FK cascade deletes the user row automatically.
  const [linkedUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.employeeId, params.data.id))
    .limit(1);

  // Cascade via FK deletes linked user automatically
  const [deleted] = await db
    .delete(employeesTable)
    .where(eq(employeesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  // Evict stale cached permissions so a deleted user cannot retain access
  // for up to 60 s on a still-active session.
  if (linkedUser) {
    invalidatePermissionsCache(linkedUser.id);
  }

  res.sendStatus(204);
});

export default router;
