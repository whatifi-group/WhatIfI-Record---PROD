import { Router, type IRouter } from "express";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, departmentsTable, employeesTable } from "@workspace/db";
import { requirePermission } from "../../middlewares/requirePermission";
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

  const [created] = await db
    .insert(employeesTable)
    .values({
      ...parsed.data,
      startDate: toDateString(parsed.data.startDate),
      salary: parsed.data.salary != null ? String(parsed.data.salary) : null,
    })
    .returning();

  const [row] = await employeeSelection().where(
    eq(employeesTable.id, created.id),
  );

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

router.patch("/employees/:id", requirePermission("edit_employees"), async (req, res): Promise<void> => {
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

  const [deleted] = await db
    .delete(employeesTable)
    .where(eq(employeesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
