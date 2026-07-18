import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  employeeMedicalSelectionsTable,
  employeeMedicalNotesTable,
} from "@workspace/db";
import { z } from "zod";
import { requirePermission } from "../../middlewares/requirePermission";

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const MedicalPutBody = z.object({
  selections: z.array(z.string()),
  notes: z.string().optional().nullable(),
});

router.get("/employees/:id/medical", requirePermission(["hr:access", "sysadmin"]), async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [selections, notesRow] = await Promise.all([
    db
      .select()
      .from(employeeMedicalSelectionsTable)
      .where(eq(employeeMedicalSelectionsTable.employeeId, params.data.id)),
    db
      .select()
      .from(employeeMedicalNotesTable)
      .where(eq(employeeMedicalNotesTable.employeeId, params.data.id))
      .then((rows) => rows[0] ?? null),
  ]);
  res.json({
    selections: selections.map((s) => s.lovValue),
    notes: notesRow?.notes ?? null,
  });
});

router.put("/employees/:id/medical", requirePermission(["hr:access", "sysadmin"]), async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = MedicalPutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const employeeId = params.data.id;

  // Replace selections
  await db
    .delete(employeeMedicalSelectionsTable)
    .where(eq(employeeMedicalSelectionsTable.employeeId, employeeId));

  if (parsed.data.selections.length > 0) {
    await db.insert(employeeMedicalSelectionsTable).values(
      parsed.data.selections.map((v) => ({ employeeId, lovValue: v })),
    );
  }

  // Upsert notes
  await db
    .insert(employeeMedicalNotesTable)
    .values({ employeeId, notes: parsed.data.notes ?? null })
    .onConflictDoUpdate({
      target: employeeMedicalNotesTable.employeeId,
      set: { notes: parsed.data.notes ?? null },
    });

  res.json({
    selections: parsed.data.selections,
    notes: parsed.data.notes ?? null,
  });
});

export default router;
