import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, departmentsTable, employeesTable } from "@workspace/db";
import {
  CreateDepartmentBody,
  UpdateDepartmentBody,
  GetDepartmentParams,
  UpdateDepartmentParams,
  DeleteDepartmentParams,
  ListDepartmentsResponse,
  GetDepartmentResponse,
  CreateDepartmentResponse,
  UpdateDepartmentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function withEmployeeCount() {
  const rows = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      description: departmentsTable.description,
      headEmployeeId: departmentsTable.headEmployeeId,
      createdAt: departmentsTable.createdAt,
      employeeCount: sql<number>`count(${employeesTable.id})::int`,
    })
    .from(departmentsTable)
    .leftJoin(
      employeesTable,
      eq(employeesTable.departmentId, departmentsTable.id),
    )
    .groupBy(departmentsTable.id)
    .orderBy(departmentsTable.name);
  return rows;
}

router.get("/departments", async (req, res): Promise<void> => {
  req.log.info("Listing departments");
  const rows = await withEmployeeCount();
  res.json(ListDepartmentsResponse.parse(rows));
});

router.post("/departments", async (req, res): Promise<void> => {
  const parsed = CreateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [department] = await db
    .insert(departmentsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(
    CreateDepartmentResponse.parse({ ...department, employeeCount: 0 }),
  );
});

router.get("/departments/:id", async (req, res): Promise<void> => {
  const params = GetDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await withEmployeeCount();
  const department = rows.find((d) => d.id === params.data.id);

  if (!department) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  res.json(GetDepartmentResponse.parse(department));
});

router.patch("/departments/:id", async (req, res): Promise<void> => {
  const params = UpdateDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(departmentsTable)
    .set(parsed.data)
    .where(eq(departmentsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  const [{ employeeCount }] = await db
    .select({ employeeCount: sql<number>`count(*)::int` })
    .from(employeesTable)
    .where(eq(employeesTable.departmentId, updated.id));

  res.json(UpdateDepartmentResponse.parse({ ...updated, employeeCount }));
});

router.delete("/departments/:id", async (req, res): Promise<void> => {
  const params = DeleteDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(departmentsTable)
    .where(eq(departmentsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
