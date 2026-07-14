import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, qualificationTypesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const QualificationTypeInput = z.object({
  name: z.string().min(1),
  awardingBody: z.string().optional().nullable(),
  validityValue: z.number().int().positive().optional().nullable(),
  validityUnit: z.enum(["days", "months", "years"]).optional().nullable(),
  isActive: z.boolean().optional(),
});

const QualificationTypeUpdate = z.object({
  name: z.string().min(1).optional(),
  awardingBody: z.string().optional().nullable(),
  validityValue: z.number().int().positive().optional().nullable(),
  validityUnit: z.enum(["days", "months", "years"]).optional().nullable(),
  isActive: z.boolean().optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

// GET /sysadmin/qualification-types
router.get("/sysadmin/qualification-types", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(qualificationTypesTable)
    .orderBy(asc(qualificationTypesTable.name));
  res.json(rows);
});

// POST /sysadmin/qualification-types
router.post("/sysadmin/qualification-types", async (req, res): Promise<void> => {
  const parsed = QualificationTypeInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(qualificationTypesTable)
    .values({ ...parsed.data })
    .returning();
  res.status(201).json(created);
});

// PATCH /sysadmin/qualification-types/:id
router.patch("/sysadmin/qualification-types/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = QualificationTypeUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(qualificationTypesTable)
    .set(parsed.data)
    .where(eq(qualificationTypesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Qualification type not found" });
    return;
  }
  res.json(updated);
});

// DELETE /sysadmin/qualification-types/:id
router.delete("/sysadmin/qualification-types/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db
    .delete(qualificationTypesTable)
    .where(eq(qualificationTypesTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Qualification type not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
