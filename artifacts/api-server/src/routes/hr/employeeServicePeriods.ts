import { Router, type IRouter } from "express";
import { and, asc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, employeeServicePeriodsTable } from "@workspace/db";
import { z } from "zod";
import { requirePermission } from "../../middlewares/requirePermission";

const router: IRouter = Router({ mergeParams: true });
const EDIT = ["hr:access", "sysadmin"];

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const PeriodIdParam = z.object({
  id: z.coerce.number().int().positive(),
  periodId: z.coerce.number().int().positive(),
});

const ServicePeriodInput = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endReason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const ServicePeriodUpdate = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endReason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /employees/:id/service-periods
router.get("/employees/:id/service-periods", requirePermission(EDIT), async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(employeeServicePeriodsTable)
    .where(eq(employeeServicePeriodsTable.employeeId, params.data.id))
    .orderBy(asc(employeeServicePeriodsTable.startDate));

  res.json(rows);
});

// POST /employees/:id/service-periods
router.post("/employees/:id/service-periods", requirePermission(EDIT), async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ServicePeriodInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Validate end_date is after start_date when both are supplied
  if (parsed.data.endDate && parsed.data.endDate <= parsed.data.startDate) {
    res.status(400).json({ error: "endDate must be after startDate" });
    return;
  }

  // Overlap check — reject if any existing period for this employee shares time with the new one.
  // Two periods [s1,e1] and [s2,e2] overlap iff s1 < e2_eff AND s2 < e1_eff (NULL end = open/infinity).
  {
    const overlapWhere: ReturnType<typeof and>[] = [
      eq(employeeServicePeriodsTable.employeeId, params.data.id),
      // existing period ends after new period starts (or existing is open-ended)
      or(
        isNull(employeeServicePeriodsTable.endDate),
        gt(employeeServicePeriodsTable.endDate, parsed.data.startDate),
      )!,
    ];
    // If new period has an end date, existing must start before it
    if (parsed.data.endDate) {
      overlapWhere.push(lt(employeeServicePeriodsTable.startDate, parsed.data.endDate) as ReturnType<typeof and>);
    }
    const overlapping = await db
      .select({ id: employeeServicePeriodsTable.id })
      .from(employeeServicePeriodsTable)
      .where(and(...overlapWhere));
    if (overlapping.length > 0) {
      res.status(400).json({ error: "Service period overlaps an existing period for this employee" });
      return;
    }
  }

  const [created] = await db
    .insert(employeeServicePeriodsTable)
    .values({
      employeeId: params.data.id,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate ?? null,
      endReason: parsed.data.endReason ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  res.status(201).json(created);
});

// PUT /employees/:id/service-periods/:periodId
router.put(
  "/employees/:id/service-periods/:periodId",
  requirePermission(EDIT),
  async (req, res): Promise<void> => {
    const params = PeriodIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = ServicePeriodUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Load existing record to validate date ordering
    const [existing] = await db
      .select()
      .from(employeeServicePeriodsTable)
      .where(
        and(
          eq(employeeServicePeriodsTable.id, params.data.periodId),
          eq(employeeServicePeriodsTable.employeeId, params.data.id),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Service period not found" });
      return;
    }

    const effectiveStartDate = parsed.data.startDate ?? existing.startDate;
    const effectiveEndDate =
      parsed.data.endDate !== undefined ? parsed.data.endDate : existing.endDate;

    if (
      effectiveEndDate &&
      effectiveEndDate <= effectiveStartDate
    ) {
      res.status(400).json({ error: "endDate must be after startDate" });
      return;
    }

    // Overlap check — same logic as POST but excluding the period being updated.
    {
      const overlapWhere: ReturnType<typeof and>[] = [
        eq(employeeServicePeriodsTable.employeeId, params.data.id),
        ne(employeeServicePeriodsTable.id, params.data.periodId),
        or(
          isNull(employeeServicePeriodsTable.endDate),
          gt(employeeServicePeriodsTable.endDate, effectiveStartDate),
        )!,
      ];
      if (effectiveEndDate) {
        overlapWhere.push(lt(employeeServicePeriodsTable.startDate, effectiveEndDate) as ReturnType<typeof and>);
      }
      const overlapping = await db
        .select({ id: employeeServicePeriodsTable.id })
        .from(employeeServicePeriodsTable)
        .where(and(...overlapWhere));
      if (overlapping.length > 0) {
        res.status(400).json({ error: "Service period overlaps an existing period for this employee" });
        return;
      }
    }

    const [updated] = await db
      .update(employeeServicePeriodsTable)
      .set({
        ...(parsed.data.startDate !== undefined && {
          startDate: parsed.data.startDate,
        }),
        ...(parsed.data.endDate !== undefined && {
          endDate: parsed.data.endDate,
        }),
        ...(parsed.data.endReason !== undefined && {
          endReason: parsed.data.endReason,
        }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
        updatedAt: new Date(),
      })
      .where(eq(employeeServicePeriodsTable.id, params.data.periodId))
      .returning();

    res.json(updated);
  },
);

// DELETE /employees/:id/service-periods/:periodId
router.delete(
  "/employees/:id/service-periods/:periodId",
  requirePermission(EDIT),
  async (req, res): Promise<void> => {
    const params = PeriodIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // Reject deletion if this is the only period for the employee
    const allPeriods = await db
      .select({ id: employeeServicePeriodsTable.id })
      .from(employeeServicePeriodsTable)
      .where(eq(employeeServicePeriodsTable.employeeId, params.data.id));

    if (allPeriods.length <= 1) {
      res
        .status(400)
        .json({ error: "Cannot delete the only service period for this employee" });
      return;
    }

    const [deleted] = await db
      .delete(employeeServicePeriodsTable)
      .where(
        and(
          eq(employeeServicePeriodsTable.id, params.data.periodId),
          eq(employeeServicePeriodsTable.employeeId, params.data.id),
        ),
      )
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Service period not found" });
      return;
    }

    res.sendStatus(204);
  },
);

export default router;
