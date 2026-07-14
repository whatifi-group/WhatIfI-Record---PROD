import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  employeeDietarySelectionsTable,
  employeeDietaryNotesTable,
} from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const DietaryPutBody = z.object({
  selections: z.array(z.string()),
  notes: z.string().optional().nullable(),
});

router.get("/employees/:id/dietary", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [selections, notesRow] = await Promise.all([
    db
      .select()
      .from(employeeDietarySelectionsTable)
      .where(eq(employeeDietarySelectionsTable.employeeId, params.data.id)),
    db
      .select()
      .from(employeeDietaryNotesTable)
      .where(eq(employeeDietaryNotesTable.employeeId, params.data.id))
      .then((rows) => rows[0] ?? null),
  ]);
  res.json({
    selections: selections.map((s) => s.lovValue),
    notes: notesRow?.notes ?? null,
  });
});

router.put("/employees/:id/dietary", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = DietaryPutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const employeeId = params.data.id;

  // Replace selections
  await db
    .delete(employeeDietarySelectionsTable)
    .where(eq(employeeDietarySelectionsTable.employeeId, employeeId));

  if (parsed.data.selections.length > 0) {
    await db.insert(employeeDietarySelectionsTable).values(
      parsed.data.selections.map((v) => ({ employeeId, lovValue: v })),
    );
  }

  // Upsert notes
  await db
    .insert(employeeDietaryNotesTable)
    .values({ employeeId, notes: parsed.data.notes ?? null })
    .onConflictDoUpdate({
      target: employeeDietaryNotesTable.employeeId,
      set: { notes: parsed.data.notes ?? null },
    });

  res.json({
    selections: parsed.data.selections,
    notes: parsed.data.notes ?? null,
  });
});

export default router;
