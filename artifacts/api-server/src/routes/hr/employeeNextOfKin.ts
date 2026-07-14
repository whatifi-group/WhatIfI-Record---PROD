import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, employeeNextOfKinTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const KinIdParam = z.object({
  id: z.coerce.number().int().positive(),
  kinId: z.coerce.number().int().positive(),
});

const NextOfKinInput = z.object({
  name: z.string().min(1),
  relationship: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

const NextOfKinUpdate = z.object({
  name: z.string().min(1).optional(),
  relationship: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

router.get("/employees/:id/next-of-kin", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(employeeNextOfKinTable)
    .where(eq(employeeNextOfKinTable.employeeId, params.data.id))
    .orderBy(employeeNextOfKinTable.createdAt);
  res.json(rows);
});

router.post("/employees/:id/next-of-kin", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = NextOfKinInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(employeeNextOfKinTable)
    .values({ ...parsed.data, employeeId: params.data.id })
    .returning();
  res.status(201).json(created);
});

router.patch(
  "/employees/:id/next-of-kin/:kinId",
  async (req, res): Promise<void> => {
    const params = KinIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = NextOfKinUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(employeeNextOfKinTable)
      .set(parsed.data)
      .where(
        and(
          eq(employeeNextOfKinTable.id, params.data.kinId),
          eq(employeeNextOfKinTable.employeeId, params.data.id),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Next of kin record not found" });
      return;
    }
    res.json(updated);
  },
);

router.delete(
  "/employees/:id/next-of-kin/:kinId",
  async (req, res): Promise<void> => {
    const params = KinIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(employeeNextOfKinTable)
      .where(
        and(
          eq(employeeNextOfKinTable.id, params.data.kinId),
          eq(employeeNextOfKinTable.employeeId, params.data.id),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Next of kin record not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
