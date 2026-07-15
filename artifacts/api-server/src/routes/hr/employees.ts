import { Router, type IRouter } from "express";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, departmentsTable, employeesTable, rolesTable, usersTable } from "@workspace/db";
import {
  requirePermission,
  getEffectivePermissions,
  invalidatePermissionsCache,
} from "../../middlewares/requirePermission";
import { hashPassword } from "../../lib/password";
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
      phone: employeesTable.phone,
      jobTitle: employeesTable.jobTitle,
      departmentId: employeesTable.departmentId,
      departmentName: departmentsTable.name,
      employmentType: employeesTable.employmentType,
      status: employeesTable.status,
      startDate: employeesTable.startDate,
      salary: sql<number | null>`${employeesTable.salary}::float8`,
      avatarUrl: employeesTable.avatarUrl,
      leaverReason: employeesTable.leaverReason,
      leaverDate: employeesTable.leaverDate,
      createdAt: employeesTable.createdAt,
    })
    .from(employeesTable)
    .leftJoin(
      departmentsTable,
      eq(employeesTable.departmentId, departmentsTable.id),
    );
}

/** True when the given permission set allows viewing payroll-sensitive fields. */
function canViewPayroll(perms: Set<string>): boolean {
  return perms.has("view_payroll") || perms.has("sysadmin");
}

/**
 * Strip salary from an employee row if the caller lacks payroll permission.
 *
 * ⚠️  IMPORTANT — future endpoint authors:
 * Every route that returns employee data MUST call redactSalary() (or an
 * equivalent guard) before sending the response.  Failing to do so will
 * silently leak payroll data to unpermissioned callers.  The pattern is:
 *
 *   const perms = req.effectivePermissions ??
 *     (userId ? await getEffectivePermissions(userId) : new Set<string>());
 *   res.json(SomeResponse.parse(redactSalary(row, canViewPayroll(perms))));
 *
 * Integration tests in src/test/employeeSalaryVisibility.test.ts verify this
 * for every existing endpoint — add a new test block when you add a new route.
 */
function redactSalary<T extends { salary?: number | null }>(
  row: T,
  allowed: boolean,
): T {
  if (allowed) return row;
  return { ...row, salary: null };
}

router.get("/employees", async (req, res): Promise<void> => {
  const query = ListEmployeesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
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
  if (query.data.departmentId != null) {
    conditions.push(eq(employeesTable.departmentId, query.data.departmentId));
  }
  if (query.data.status) {
    conditions.push(eq(employeesTable.status, query.data.status));
  }

  const base = employeeSelection();
  const rows = await (conditions.length > 0
    ? base.where(and(...conditions))
    : base
  ).orderBy(employeesTable.lastName, employeesTable.firstName);

  // Salary is payroll-sensitive — only expose it to users with view_payroll or sysadmin.
  // req.effectivePermissions is pre-loaded by requireAuth; fall back for safety.
  const userId = req.session?.userId;
  const perms =
    req.effectivePermissions ??
    (userId ? await getEffectivePermissions(userId) : new Set<string>());
  const showSalary = canViewPayroll(perms);

  res.json(ListEmployeesResponse.parse(rows.map((r) => redactSalary(r, showSalary))));
});

router.post("/employees", async (req, res): Promise<void> => {
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

  // Verify the requested role exists
  const role = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.id, parsed.data.userRole))
    .limit(1);

  if (role.length === 0) {
    res.status(400).json({ error: "User role not found" });
    return;
  }

  const { userRole, temporaryPassword, ...employeeData } = parsed.data;

  // Create employee + linked user in a single transaction
  const created = await db.transaction(async (tx) => {
    const [employee] = await tx
      .insert(employeesTable)
      .values({
        ...employeeData,
        startDate: toDateString(employeeData.startDate),
        salary: employeeData.salary != null ? String(employeeData.salary) : null,
      })
      .returning();

    await tx.insert(usersTable).values({
      name: `${employeeData.firstName} ${employeeData.lastName}`,
      email: employeeData.email.toLowerCase(),
      passwordHash: hashPassword(temporaryPassword),
      status: "active",
      roleId: userRole,
      permissions: [],
      isSystemAccount: false,
      employeeId: employee.id,
    });

    return employee;
  });

  const [row] = await employeeSelection().where(eq(employeesTable.id, created.id));
  res.status(201).json(CreateEmployeeResponse.parse(row));
});

router.get("/employees/:id", async (req, res): Promise<void> => {
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

  const userId = req.session?.userId;
  const perms =
    req.effectivePermissions ??
    (userId ? await getEffectivePermissions(userId) : new Set<string>());
  res.json(GetEmployeeResponse.parse(redactSalary(row, canViewPayroll(perms))));
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

  const { salary, startDate, leaverDate, ...rest } = parsed.data;
  const today = new Date().toISOString().slice(0, 10);

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

  // When marking as leaver, suspend the linked user account in the same operation
  if (parsed.data.status === "leaver") {
    await db
      .update(usersTable)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(usersTable.employeeId, updated.id));
  }

  const [row] = await employeeSelection().where(
    eq(employeesTable.id, updated.id),
  );

  const userId = req.session?.userId;
  const perms =
    req.effectivePermissions ??
    (userId ? await getEffectivePermissions(userId) : new Set<string>());
  res.json(UpdateEmployeeResponse.parse(redactSalary(row, canViewPayroll(perms))));
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
