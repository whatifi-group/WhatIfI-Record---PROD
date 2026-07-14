import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, employeeWorkRecordsTable } from "@workspace/db";
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
