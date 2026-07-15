import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
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

const PayRateInput = z.object({
  shiftType: z.string().min(1),
  rate: z.number().min(0),
  rateUnit: z.enum(["hourly", "daily", "flat"]).default("hourly"),
  notes: z.string().optional().nullable(),
});

const PayRateUpdate = z.object({
  shiftType: z.string().min(1).optional(),
  rate: z.number().min(0).optional(),
  rateUnit: z.enum(["hourly", "daily", "flat"]).optional(),
  notes: z.string().optional().nullable(),
});

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
      createdAt: employeePayRatesTable.createdAt,
    })
    .from(employeePayRatesTable);
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
      .orderBy(employeePayRatesTable.createdAt);
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
    if (!(await isValidShiftType(parsed.data.shiftType))) {
      res.status(400).json({ error: `Invalid shift type: "${parsed.data.shiftType}"` });
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
    if (parsed.data.shiftType !== undefined && !(await isValidShiftType(parsed.data.shiftType))) {
      res.status(400).json({ error: `Invalid shift type: "${parsed.data.shiftType}"` });
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
    const { overwrite } = query.data;

    if (targetId === sourceId) {
      res.status(400).json({ error: "Cannot copy pay rates from the same employee" });
      return;
    }

    // Fetch source rates
    const sourceRates = await payRateSelection().where(
      eq(employeePayRatesTable.employeeId, sourceId),
    );

    // Fetch existing target rates to detect conflicts
    const existingRows = await db
      .select({ id: employeePayRatesTable.id, shiftType: employeePayRatesTable.shiftType })
      .from(employeePayRatesTable)
      .where(eq(employeePayRatesTable.employeeId, targetId));

    const existingByShiftType = new Map(existingRows.map((r) => [r.shiftType, r.id]));

    // Fetch active shift types from the LOV so we don't copy orphaned values
    const activeRows = await db
      .select({ value: lovItemsTable.value })
      .from(lovItemsTable)
      .where(
        and(eq(lovItemsTable.category, "shift_type"), eq(lovItemsTable.isActive, true)),
      );
    const activeLovValues = new Set(activeRows.map((r) => r.value));

    const copied = [];
    const skipped: string[] = [];

    for (const rate of sourceRates) {
      // Skip rates for inactive LOV entries regardless of overwrite flag
      if (!activeLovValues.has(rate.shiftType)) {
        skipped.push(rate.shiftType);
        continue;
      }

      const existingId = existingByShiftType.get(rate.shiftType);

      if (existingId !== undefined) {
        if (!overwrite) {
          // Default behaviour: skip conflicts
          skipped.push(rate.shiftType);
          continue;
        }

        // overwrite=true: update the target's existing rate with the source values
        await db
          .update(employeePayRatesTable)
          .set({
            rate: String(rate.rate),
            rateUnit: rate.rateUnit,
            notes: rate.notes ?? null,
          })
          .where(eq(employeePayRatesTable.id, existingId));

        const [updated] = await payRateSelection().where(
          eq(employeePayRatesTable.id, existingId),
        );
        copied.push(updated);
      } else {
        // No conflict: insert new rate on target
        const [inserted] = await db
          .insert(employeePayRatesTable)
          .values({
            employeeId: targetId,
            shiftType: rate.shiftType,
            rate: String(rate.rate),
            rateUnit: rate.rateUnit,
            notes: rate.notes ?? null,
          })
          .returning({ id: employeePayRatesTable.id });

        const [created] = await payRateSelection().where(
          eq(employeePayRatesTable.id, inserted.id),
        );
        copied.push(created);
      }
    }

    res.json({ copied, skipped });
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
