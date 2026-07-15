import { Router, type IRouter } from "express";
import { and, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db, employeeWorkRecordsTable, employeesTable, departmentsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const RecordIdParam = z.object({
  id: z.coerce.number().int().positive(),
  recordId: z.coerce.number().int().positive(),
});

const WorkRecordInput = z.object({
  shiftDate: z.string().min(1), // ISO date string YYYY-MM-DD
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  hoursWorked: z.number().optional().nullable(),
  shiftType: z.string().optional(),
  notes: z.string().optional().nullable(),
});

const WorkRecordUpdate = z.object({
  shiftDate: z.string().min(1).optional(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  hoursWorked: z.number().optional().nullable(),
  shiftType: z.string().optional(),
  notes: z.string().optional().nullable(),
});

/** Select all columns, casting hoursWorked numeric → JS number to match the OpenAPI contract. */
function workRecordSelection() {
  return db.select({
    id: employeeWorkRecordsTable.id,
    employeeId: employeeWorkRecordsTable.employeeId,
    shiftDate: employeeWorkRecordsTable.shiftDate,
    startTime: employeeWorkRecordsTable.startTime,
    endTime: employeeWorkRecordsTable.endTime,
    hoursWorked:
      sql<number | null>`${employeeWorkRecordsTable.hoursWorked}::float8`,
    shiftType: employeeWorkRecordsTable.shiftType,
    notes: employeeWorkRecordsTable.notes,
    createdAt: employeeWorkRecordsTable.createdAt,
  }).from(employeeWorkRecordsTable);
}

const ListWorkRecordsQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  shiftType: z.string().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  employeeStatus: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * GET /work-records — aggregation endpoint.
 * Returns work records joined with employee context in a single query,
 * avoiding the N-per-employee fan-out pattern on the client.
 */
router.get("/work-records", async (req, res): Promise<void> => {
  const parsed = ListWorkRecordsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { from, to, shiftType, departmentId, employeeStatus, search, page, pageSize } =
    parsed.data;

  const conditions: SQL[] = [];

  if (from) {
    conditions.push(gte(employeeWorkRecordsTable.shiftDate, from));
  }
  if (to) {
    conditions.push(lte(employeeWorkRecordsTable.shiftDate, to));
  }
  if (shiftType) {
    conditions.push(eq(employeeWorkRecordsTable.shiftType, shiftType));
  }
  if (departmentId != null) {
    conditions.push(eq(employeesTable.departmentId, departmentId));
  }
  if (employeeStatus) {
    conditions.push(
      eq(
        employeesTable.status,
        employeeStatus as "active" | "inactive" | "on_leave" | "leaver",
      ),
    );
  }
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(employeesTable.firstName, term),
        ilike(employeesTable.lastName, term),
        ilike(employeesTable.email, term),
      )!,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Run count and paginated rows as concurrent queries
  const [countResult, rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(employeeWorkRecordsTable)
      .innerJoin(
        employeesTable,
        eq(employeeWorkRecordsTable.employeeId, employeesTable.id),
      )
      .leftJoin(
        departmentsTable,
        eq(employeesTable.departmentId, departmentsTable.id),
      )
      .where(whereClause),
    db
      .select({
        id: employeeWorkRecordsTable.id,
        employeeId: employeeWorkRecordsTable.employeeId,
        shiftDate: employeeWorkRecordsTable.shiftDate,
        startTime: employeeWorkRecordsTable.startTime,
        endTime: employeeWorkRecordsTable.endTime,
        hoursWorked:
          sql<number | null>`${employeeWorkRecordsTable.hoursWorked}::float8`,
        shiftType: employeeWorkRecordsTable.shiftType,
        notes: employeeWorkRecordsTable.notes,
        createdAt: employeeWorkRecordsTable.createdAt,
        employeeFirstName: employeesTable.firstName,
        employeeLastName: employeesTable.lastName,
        employeeEmail: employeesTable.email,
        employeeStatus: employeesTable.status,
        employeeDepartmentId: employeesTable.departmentId,
        employeeDepartmentName: departmentsTable.name,
        employeeAvatarUrl: employeesTable.avatarUrl,
        employeeLeaverDate: employeesTable.leaverDate,
        employeeLeaverReason: employeesTable.leaverReason,
      })
      .from(employeeWorkRecordsTable)
      .innerJoin(
        employeesTable,
        eq(employeeWorkRecordsTable.employeeId, employeesTable.id),
      )
      .leftJoin(
        departmentsTable,
        eq(employeesTable.departmentId, departmentsTable.id),
      )
      .where(whereClause)
      .orderBy(
        employeeWorkRecordsTable.shiftDate,
        employeesTable.lastName,
        employeesTable.firstName,
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = countResult[0]?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  res.json({ rows, total, page, pageSize, totalPages });
});

router.get(
  "/employees/:id/work-records",
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await workRecordSelection()
      .where(eq(employeeWorkRecordsTable.employeeId, params.data.id))
      .orderBy(employeeWorkRecordsTable.shiftDate);
    res.json(rows);
  },
);

router.post(
  "/employees/:id/work-records",
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = WorkRecordInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [created] = await db
      .insert(employeeWorkRecordsTable)
      .values({
        ...parsed.data,
        employeeId: params.data.id,
        hoursWorked:
          parsed.data.hoursWorked != null
            ? String(parsed.data.hoursWorked)
            : null,
      })
      .returning({ id: employeeWorkRecordsTable.id });

    const [row] = await workRecordSelection().where(
      eq(employeeWorkRecordsTable.id, created.id),
    );
    res.status(201).json(row);
  },
);

router.patch(
  "/employees/:id/work-records/:recordId",
  async (req, res): Promise<void> => {
    const params = RecordIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = WorkRecordUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { hoursWorked, ...rest } = parsed.data;
    const [updated] = await db
      .update(employeeWorkRecordsTable)
      .set({
        ...rest,
        ...(hoursWorked !== undefined
          ? { hoursWorked: hoursWorked != null ? String(hoursWorked) : null }
          : {}),
      })
      .where(
        and(
          eq(employeeWorkRecordsTable.id, params.data.recordId),
          eq(employeeWorkRecordsTable.employeeId, params.data.id),
        ),
      )
      .returning({ id: employeeWorkRecordsTable.id });

    if (!updated) {
      res.status(404).json({ error: "Work record not found" });
      return;
    }
    const [row] = await workRecordSelection().where(
      eq(employeeWorkRecordsTable.id, updated.id),
    );
    res.json(row);
  },
);

router.delete(
  "/employees/:id/work-records/:recordId",
  async (req, res): Promise<void> => {
    const params = RecordIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(employeeWorkRecordsTable)
      .where(
        and(
          eq(employeeWorkRecordsTable.id, params.data.recordId),
          eq(employeeWorkRecordsTable.employeeId, params.data.id),
        ),
      )
      .returning({ id: employeeWorkRecordsTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Work record not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
