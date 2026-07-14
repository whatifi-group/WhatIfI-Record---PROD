import { Router, type IRouter } from "express";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { db, employeesTable, leaveRequestsTable } from "@workspace/db";
import {
  CreateLeaveRequestBody,
  UpdateLeaveRequestBody,
  GetLeaveRequestParams,
  UpdateLeaveRequestParams,
  DeleteLeaveRequestParams,
  ListLeaveRequestsQueryParams,
  ListLeaveRequestsResponse,
  GetLeaveRequestResponse,
  CreateLeaveRequestResponse,
  UpdateLeaveRequestResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function leaveRequestSelection() {
  return db
    .select({
      id: leaveRequestsTable.id,
      employeeId: leaveRequestsTable.employeeId,
      employeeName: sql<string>`${employeesTable.firstName} || ' ' || ${employeesTable.lastName}`,
      type: leaveRequestsTable.type,
      startDate: leaveRequestsTable.startDate,
      endDate: leaveRequestsTable.endDate,
      status: leaveRequestsTable.status,
      reason: leaveRequestsTable.reason,
      createdAt: leaveRequestsTable.createdAt,
    })
    .from(leaveRequestsTable)
    .innerJoin(
      employeesTable,
      eq(leaveRequestsTable.employeeId, employeesTable.id),
    );
}

router.get("/leave-requests", async (req, res): Promise<void> => {
  const query = ListLeaveRequestsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];
  if (query.data.employeeId != null) {
    conditions.push(eq(leaveRequestsTable.employeeId, query.data.employeeId));
  }
  if (query.data.status) {
    conditions.push(eq(leaveRequestsTable.status, query.data.status));
  }

  const base = leaveRequestSelection();
  const rows = await (conditions.length > 0
    ? base.where(and(...conditions))
    : base
  ).orderBy(leaveRequestsTable.startDate);

  res.json(ListLeaveRequestsResponse.parse(rows));
});

router.post("/leave-requests", async (req, res): Promise<void> => {
  const parsed = CreateLeaveRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [employee] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.id, parsed.data.employeeId));

  if (!employee) {
    res.status(400).json({ error: "Employee not found" });
    return;
  }

  const [created] = await db
    .insert(leaveRequestsTable)
    .values({
      ...parsed.data,
      startDate: toDateString(parsed.data.startDate),
      endDate: toDateString(parsed.data.endDate),
    })
    .returning();

  const [row] = await leaveRequestSelection().where(
    eq(leaveRequestsTable.id, created.id),
  );

  res.status(201).json(CreateLeaveRequestResponse.parse(row));
});

router.get("/leave-requests/:id", async (req, res): Promise<void> => {
  const params = GetLeaveRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await leaveRequestSelection().where(
    eq(leaveRequestsTable.id, params.data.id),
  );

  if (!row) {
    res.status(404).json({ error: "Leave request not found" });
    return;
  }

  res.json(GetLeaveRequestResponse.parse(row));
});

router.patch("/leave-requests/:id", async (req, res): Promise<void> => {
  const params = UpdateLeaveRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateLeaveRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { startDate, endDate, ...rest } = parsed.data;

  const [updated] = await db
    .update(leaveRequestsTable)
    .set({
      ...rest,
      ...(startDate !== undefined ? { startDate: toDateString(startDate) } : {}),
      ...(endDate !== undefined ? { endDate: toDateString(endDate) } : {}),
    })
    .where(eq(leaveRequestsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Leave request not found" });
    return;
  }

  const [row] = await leaveRequestSelection().where(
    eq(leaveRequestsTable.id, updated.id),
  );

  res.json(UpdateLeaveRequestResponse.parse(row));
});

router.delete("/leave-requests/:id", async (req, res): Promise<void> => {
  const params = DeleteLeaveRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(leaveRequestsTable)
    .where(eq(leaveRequestsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Leave request not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
