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

router.post(
  "/employees/:id/pay-rates/copy-from/:sourceId",
  requirePermission(["view_payroll", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = CopyFromParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { id: targetId, sourceId } = params.data;

    if (targetId === sourceId) {
      res.status(400).json({ error: "Cannot copy pay rates from the same employee" });
      return;
    }

    // Fetch source rates
    const sourceRates = await payRateSelection().where(
      eq(employeePayRatesTable.employeeId, sourceId),
    );

    // Fetch shift types already on the target to detect conflicts
    const existingRows = await db
      .select({ shiftType: employeePayRatesTable.shiftType })
      .from(employeePayRatesTable)
      .where(eq(employeePayRatesTable.employeeId, targetId));

    const existingShiftTypes = new Set(existingRows.map((r) => r.shiftType));

    // Fetch active shift types from the LOV so we don't copy orphaned values
    const activeRows = await db
      .select({ value: lovItemsTable.value })
      .from(lovItemsTable)
      .where(
        and(eq(lovItemsTable.category, "shift_type"), eq(lovItemsTable.isActive, true)),
      );
    const activeLovValues = new Set(activeRows.map((r) => r.value));

    const toInsert = sourceRates.filter(
      (r) => !existingShiftTypes.has(r.shiftType) && activeLovValues.has(r.shiftType),
    );
    const skipped = sourceRates
      .filter((r) => existingShiftTypes.has(r.shiftType) || !activeLovValues.has(r.shiftType))
      .map((r) => r.shiftType);

    const copied = [];
    for (const rate of toInsert) {
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
