import { Router, type IRouter } from "express";
import { and, eq, isNull, or, gte, lte, ne, sql } from "drizzle-orm";
import { db, employeePayRatesTable, lovItemsTable } from "@workspace/db";
import { z } from "zod";
import { requirePermission } from "../../middlewares/requirePermission";

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const RateIdParam = z.object({
  id: z.coerce.number().int().positive(),
  rateId: z.coerce.number().int().positive(),
});

const CopyFromParams = z.object({
  id: z.coerce.number().int().positive(),
  sourceId: z.coerce.number().int().positive(),
});

/**
 * Accepts "YYYY-MM-DD" or a full ISO datetime (e.g. "2025-07-15T00:00:00.000Z"
 * as serialised by JSON.stringify(new Date(...))).  Normalises to "YYYY-MM-DD".
 */
const DateString = z
  .string()
  .min(10, "Must be a date in YYYY-MM-DD format")
  .transform((s) => s.slice(0, 10))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a valid date in YYYY-MM-DD format"));

const PayRateInput = z.object({
  shiftType: z.string().min(1),
  rate: z.number().min(0),
  rateUnit: z.enum(["hourly", "daily", "flat"]).default("hourly"),
  notes: z.string().optional().nullable(),
  effectiveFrom: DateString,
  effectiveTo: DateString.optional().nullable(),
});

const PayRateUpdate = z.object({
  shiftType: z.string().min(1).optional(),
  rate: z.number().min(0).optional(),
  rateUnit: z.enum(["hourly", "daily", "flat"]).optional(),
  notes: z.string().optional().nullable(),
  effectiveFrom: DateString.optional(),
  effectiveTo: DateString.optional().nullable(),
});

/**
 * Returns true when there is already a pay rate for the same employee + shift
 * type whose date range overlaps [newFrom, newTo].
 *
 * Two ranges overlap when neither ends before the other starts.
 *   condition: (existing.effectiveTo IS NULL OR existing.effectiveTo >= newFrom)
 *          AND (newTo IS NULL OR existing.effectiveFrom <= newTo)
 *
 * @param excludeRateId - id of the rate being updated (excluded from the check)
 */
async function hasOverlappingRate(
  employeeId: number,
  shiftType: string,
  newFrom: string,
  newTo: string | null | undefined,
  excludeRateId?: number,
): Promise<boolean> {
  // Existing rate must not have ended before the new range starts
  const existingStillOpen = or(
    isNull(employeePayRatesTable.effectiveTo),
    gte(employeePayRatesTable.effectiveTo, newFrom),
  )!;

  // New range must not end before the existing rate starts (only relevant when newTo is set)
  const newNotEndedBeforeExisting = newTo
    ? lte(employeePayRatesTable.effectiveFrom, newTo)
    : undefined;

  const overlapCondition = newNotEndedBeforeExisting
    ? and(existingStillOpen, newNotEndedBeforeExisting)!
    : existingStillOpen;

  const conditions = [
    eq(employeePayRatesTable.employeeId, employeeId),
    eq(employeePayRatesTable.shiftType, shiftType),
    overlapCondition,
    ...(excludeRateId !== undefined ? [ne(employeePayRatesTable.id, excludeRateId)] : []),
  ];

  const [existing] = await db
    .select({ id: employeePayRatesTable.id })
    .from(employeePayRatesTable)
    .where(and(...conditions))
    .limit(1);

  return existing !== undefined;
}

/** Returns true if the given shiftType is an active entry in the shift_type LOV category. */
async function isValidShiftType(shiftType: string): Promise<boolean> {
  const [row] = await db
    .select({ value: lovItemsTable.value })
    .from(lovItemsTable)
    .where(
      and(
        eq(lovItemsTable.category, "shift_type"),
        eq(lovItemsTable.value, shiftType),
        eq(lovItemsTable.isActive, true),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Validate that effectiveTo is not before effectiveFrom when both are provided. */
function validateDateRange(
  effectiveFrom: string | undefined,
  effectiveTo: string | null | undefined,
): string | null {
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
    return "effectiveTo cannot be before effectiveFrom";
  }
  return null;
}

/** Select all columns, casting rate numeric → JS number to match the OpenAPI contract. */
function payRateSelection() {
  return db
    .select({
      id: employeePayRatesTable.id,
      employeeId: employeePayRatesTable.employeeId,
      shiftType: employeePayRatesTable.shiftType,
      rate: sql<number>`${employeePayRatesTable.rate}::float8`,
      rateUnit: employeePayRatesTable.rateUnit,
      notes: employeePayRatesTable.notes,
      effectiveFrom: employeePayRatesTable.effectiveFrom,
      effectiveTo: employeePayRatesTable.effectiveTo,
      createdAt: employeePayRatesTable.createdAt,
    })
    .from(employeePayRatesTable);
}

/** Returns a Drizzle condition that matches currently-active pay rates
 *  (effectiveTo IS NULL or effectiveTo >= today). */
function activeRateCondition() {
  const today = new Date().toISOString().split("T")[0];
  return or(
    isNull(employeePayRatesTable.effectiveTo),
    gte(employeePayRatesTable.effectiveTo, today),
  )!;
}

router.get(
  "/employees/:id/pay-rates",
  requirePermission(["view_payroll", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await payRateSelection()
      .where(eq(employeePayRatesTable.employeeId, params.data.id))
      .orderBy(employeePayRatesTable.effectiveFrom, employeePayRatesTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/employees/:id/pay-rates",
  requirePermission(["view_payroll", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = PayRateInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const dateError = validateDateRange(parsed.data.effectiveFrom, parsed.data.effectiveTo);
    if (dateError) {
      res.status(400).json({ error: dateError });
      return;
    }
    if (!(await isValidShiftType(parsed.data.shiftType))) {
      res.status(400).json({ error: `Invalid shift type: "${parsed.data.shiftType}"` });
      return;
    }
    if (
      await hasOverlappingRate(
        params.data.id,
        parsed.data.shiftType,
        parsed.data.effectiveFrom,
        parsed.data.effectiveTo,
      )
    ) {
      res.status(409).json({
        error:
          "A pay rate for this shift type already exists covering the same date range. Close or update the existing rate first.",
      });
      return;
    }
    const [inserted] = await db
      .insert(employeePayRatesTable)
      .values({
        ...parsed.data,
        rate: String(parsed.data.rate),
        employeeId: params.data.id,
      })
      .returning({ id: employeePayRatesTable.id });

    const [created] = await payRateSelection().where(
      eq(employeePayRatesTable.id, inserted.id),
    );
    res.status(201).json(created);
  },
);

router.put(
  "/employees/:id/pay-rates/:rateId",
  requirePermission(["view_payroll", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = RateIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = PayRateUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Always fetch the existing row so we can merge missing fields for validation
    const [existing] = await db
      .select({
        shiftType: employeePayRatesTable.shiftType,
        effectiveFrom: employeePayRatesTable.effectiveFrom,
        effectiveTo: employeePayRatesTable.effectiveTo,
      })
      .from(employeePayRatesTable)
      .where(
        and(
          eq(employeePayRatesTable.id, params.data.rateId),
          eq(employeePayRatesTable.employeeId, params.data.id),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Pay rate not found" });
      return;
    }

    const mergedShiftType = parsed.data.shiftType ?? existing.shiftType;
    const mergedFrom = parsed.data.effectiveFrom ?? existing.effectiveFrom;
    const mergedTo =
      parsed.data.effectiveTo !== undefined
        ? parsed.data.effectiveTo
        : existing.effectiveTo;

    const dateError = validateDateRange(mergedFrom, mergedTo);
    if (dateError) {
      res.status(400).json({ error: dateError });
      return;
    }

    if (parsed.data.shiftType !== undefined && !(await isValidShiftType(parsed.data.shiftType))) {
      res.status(400).json({ error: `Invalid shift type: "${parsed.data.shiftType}"` });
      return;
    }

    // Overlap check — exclude the rate being updated
    if (
      await hasOverlappingRate(
        params.data.id,
        mergedShiftType,
        mergedFrom,
        mergedTo,
        params.data.rateId,
      )
    ) {
      res.status(409).json({
        error:
          "A pay rate for this shift type already exists covering the same date range. Close or update the existing rate first.",
      });
      return;
    }

    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.rate !== undefined) {
      updateData.rate = String(parsed.data.rate);
    }

    const [patched] = await db
      .update(employeePayRatesTable)
      .set(updateData)
      .where(
        and(
          eq(employeePayRatesTable.id, params.data.rateId),
          eq(employeePayRatesTable.employeeId, params.data.id),
        ),
      )
      .returning({ id: employeePayRatesTable.id });

    if (!patched) {
      res.status(404).json({ error: "Pay rate not found" });
      return;
    }

    const [updated] = await payRateSelection().where(
      eq(employeePayRatesTable.id, patched.id),
    );
    res.json(updated);
  },
);

const CopyFromQuery = z.object({
  overwrite: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  /**
   * Effective start date for newly inserted rates (YYYY-MM-DD or ISO datetime).
   * Defaults to today when omitted.  Has no effect on overwritten rates —
   * those preserve the target's existing date range.
   */
  effectiveDate: DateString.optional(),
});

router.post(
  "/employees/:id/pay-rates/copy-from/:sourceId",
  requirePermission(["view_payroll", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = CopyFromParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const query = CopyFromQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }

    const { id: targetId, sourceId } = params.data;
    const { overwrite, effectiveDate } = query.data;

    if (targetId === sourceId) {
      res.status(400).json({ error: "Cannot copy pay rates from the same employee" });
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    // effectiveFrom is used as the start date for newly inserted rates.
    // Overwritten rates keep the target's existing date range regardless of this value.
    const effectiveFrom = effectiveDate ?? today;

    // Fetch ALL source rates so we can report closed ones in `skipped`
    const allSourceRates = await payRateSelection().where(
      eq(employeePayRatesTable.employeeId, sourceId),
    );

    // Partition into active (copyable) and closed (effectiveTo already in past)
    // effectiveTo is a YYYY-MM-DD string from Drizzle so string comparison is valid
    const sourceRates = allSourceRates.filter(
      (r) => !r.effectiveTo || r.effectiveTo >= today,
    );
    const closedShiftTypes = allSourceRates
      .filter((r) => r.effectiveTo && r.effectiveTo < today)
      .map((r) => r.shiftType);

    // Fetch active target rates for conflict detection; include dates for overlap re-checking
    const existingRows = await db
      .select({
        id: employeePayRatesTable.id,
        shiftType: employeePayRatesTable.shiftType,
        effectiveFrom: employeePayRatesTable.effectiveFrom,
        effectiveTo: employeePayRatesTable.effectiveTo,
      })
      .from(employeePayRatesTable)
      .where(
        and(
          eq(employeePayRatesTable.employeeId, targetId),
          activeRateCondition(),
        ),
      );

    const existingByShiftType = new Map(
      existingRows.map((r) => [r.shiftType, r]),
    );

    // Fetch active shift types from the LOV so we don't copy orphaned values
    const activeRows = await db
      .select({ value: lovItemsTable.value })
      .from(lovItemsTable)
      .where(
        and(eq(lovItemsTable.category, "shift_type"), eq(lovItemsTable.isActive, true)),
      );
    const activeLovValues = new Set(activeRows.map((r) => r.value));

    type SkipReason = "source_closed" | "lov_inactive" | "conflict" | "overlap_on_target";
    type SkippedEntry = { shiftType: string; reason: SkipReason };

    // inserted = brand-new rows on target; updated = rows overwritten via overwrite=true
    // copied = inserted ∪ updated, preserved for API backward-compatibility
    const insertedRates = [];
    const updatedRates = [];
    // Closed source rates are reported as skipped so the caller knows they were intentionally excluded
    const skipped: SkippedEntry[] = closedShiftTypes.map((st) => ({
      shiftType: st,
      reason: "source_closed" as const,
    }));

    for (const rate of sourceRates) {
      // Skip rates for inactive LOV entries regardless of overwrite flag
      if (!activeLovValues.has(rate.shiftType)) {
        skipped.push({ shiftType: rate.shiftType, reason: "lov_inactive" });
        continue;
      }

      const existingRow = existingByShiftType.get(rate.shiftType);

      if (existingRow !== undefined) {
        if (!overwrite) {
          // Default behaviour: skip conflicts
          skipped.push({ shiftType: rate.shiftType, reason: "conflict" });
          continue;
        }

        // overwrite=true: verify that the existing rate's current date range doesn't
        // overlap a THIRD rate on the target (excluding itself).  This guards against
        // corrupting data when the target already has an overlapping pair.
        if (
          await hasOverlappingRate(
            targetId,
            rate.shiftType,
            existingRow.effectiveFrom,
            existingRow.effectiveTo,
            existingRow.id,
          )
        ) {
          skipped.push({ shiftType: rate.shiftType, reason: "overlap_on_target" });
          continue;
        }

        // Safe to update — only overwrite rate/unit/notes, keep target's date range
        await db
          .update(employeePayRatesTable)
          .set({
            rate: String(rate.rate),
            rateUnit: rate.rateUnit,
            notes: rate.notes ?? null,
          })
          .where(eq(employeePayRatesTable.id, existingRow.id));

        const [overwritten] = await payRateSelection().where(
          eq(employeePayRatesTable.id, existingRow.id),
        );
        updatedRates.push(overwritten);
      } else {
        // No active conflict: insert new rate on target starting at effectiveFrom.
        // Run the full overlap guard in case an existing rate would still overlap the
        // new open-ended range starting at effectiveFrom.
        if (await hasOverlappingRate(targetId, rate.shiftType, effectiveFrom, null)) {
          skipped.push({ shiftType: rate.shiftType, reason: "overlap_on_target" });
          continue;
        }

        const [insertResult] = await db
          .insert(employeePayRatesTable)
          .values({
            employeeId: targetId,
            shiftType: rate.shiftType,
            rate: String(rate.rate),
            rateUnit: rate.rateUnit,
            notes: rate.notes ?? null,
            effectiveFrom,
          })
          .returning({ id: employeePayRatesTable.id });

        const [created] = await payRateSelection().where(
          eq(employeePayRatesTable.id, insertResult.id),
        );
        insertedRates.push(created);
      }
    }

    // `copied` = inserted ∪ updated, preserved for API backward-compatibility.
    // Callers that need to distinguish inserts from overwrites should use `updated`.
    const copied = [...insertedRates, ...updatedRates];
    res.json({ copied, updated: updatedRates, skipped });
  },
);

router.delete(
  "/employees/:id/pay-rates/:rateId",
  requirePermission(["view_payroll", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = RateIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(employeePayRatesTable)
      .where(
        and(
          eq(employeePayRatesTable.id, params.data.rateId),
          eq(employeePayRatesTable.employeeId, params.data.id),
        ),
      )
      .returning({ id: employeePayRatesTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Pay rate not found" });
      return;
    }
    res.status(204).send();
  },
);

export default router;
