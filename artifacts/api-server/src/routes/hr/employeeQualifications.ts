import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, employeeQualificationsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const QualIdParam = z.object({
  id: z.coerce.number().int().positive(),
  qualId: z.coerce.number().int().positive(),
});

const QualificationInput = z.object({
  title: z.string().min(1),
  institution: z.string().optional().nullable(),
  yearObtained: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const QualificationUpdate = z.object({
  title: z.string().min(1).optional(),
  institution: z.string().optional().nullable(),
  yearObtained: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.get(
  "/employees/:id/qualifications",
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await db
      .select()
      .from(employeeQualificationsTable)
      .where(eq(employeeQualificationsTable.employeeId, params.data.id))
      .orderBy(employeeQualificationsTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/employees/:id/qualifications",
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = QualificationInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [created] = await db
      .insert(employeeQualificationsTable)
      .values({ ...parsed.data, employeeId: params.data.id })
      .returning();
    res.status(201).json(created);
  },
);

router.patch(
  "/employees/:id/qualifications/:qualId",
  async (req, res): Promise<void> => {
    const params = QualIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = QualificationUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(employeeQualificationsTable)
      .set(parsed.data)
      .where(
        and(
          eq(employeeQualificationsTable.id, params.data.qualId),
          eq(employeeQualificationsTable.employeeId, params.data.id),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Qualification not found" });
      return;
    }
    res.json(updated);
  },
);

router.delete(
  "/employees/:id/qualifications/:qualId",
  async (req, res): Promise<void> => {
    const params = QualIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(employeeQualificationsTable)
      .where(
        and(
          eq(employeeQualificationsTable.id, params.data.qualId),
          eq(employeeQualificationsTable.employeeId, params.data.id),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Qualification not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
