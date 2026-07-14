import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, employeePayrollTable } from "@workspace/db";
import { z } from "zod";
import { requirePermission } from "../../middlewares/requirePermission";

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const PayrollInput = z.object({
  employeeNumber: z.string().optional().nullable(),
  niNumber: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  accountHolder: z.string().optional().nullable(),
  sortCode: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
});

router.get("/employees/:id/payroll", requirePermission(["view_payroll", "sysadmin"]), async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(employeePayrollTable)
    .where(eq(employeePayrollTable.employeeId, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Payroll record not found" });
    return;
  }
  res.json(row);
});

router.put("/employees/:id/payroll", requirePermission(["view_payroll", "sysadmin"]), async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = PayrollInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [upserted] = await db
    .insert(employeePayrollTable)
    .values({ ...parsed.data, employeeId: params.data.id })
    .onConflictDoUpdate({
      target: employeePayrollTable.employeeId,
      set: parsed.data,
    })
    .returning();
  res.json(upserted);
});

export default router;
