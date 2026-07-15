import { Router, type IRouter } from "express";
import { and, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, departmentsTable, employeeServicePeriodsTable, employeesTable, rolesTable, usersTable } from "@workspace/db";
import {
  requirePermission,
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

  res.json(ListEmployeesResponse.parse(rows));
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

  res.json(GetEmployeeResponse.parse(row));
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

  const { salary, startDate, leaverDate, ...rest } = parsed.data;
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

  // When marking as leaver: suspend user account + close open service period
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

  res.json(UpdateEmployeeResponse.parse(row));
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
