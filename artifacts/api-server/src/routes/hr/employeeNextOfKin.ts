import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, employeeNextOfKinTable, employeeNextOfKinPhonesTable } from "@workspace/db";
import { z } from "zod";

const PhoneLabelEnum = z.enum(["Mobile", "Home", "Work", "Other"]);

const KinPhoneInput = z.object({
  number: z.string().min(1),
  label: PhoneLabelEnum.optional().default("Mobile"),
  isPrimary: z.boolean().optional().default(false),
});

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const KinIdParam = z.object({
  id: z.coerce.number().int().positive(),
  kinId: z.coerce.number().int().positive(),
});

const NextOfKinInput = z.object({
  name: z.string().min(1),
  relationship: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phones: z.array(KinPhoneInput).optional().default([]),
});

const NextOfKinUpdate = z.object({
  name: z.string().min(1).optional(),
  relationship: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

/** Fetch phones for a given kin id, ordered by creation. */
async function getKinPhones(kinId: number) {
  return db
    .select({
      id: employeeNextOfKinPhonesTable.id,
      number: employeeNextOfKinPhonesTable.number,
      label: employeeNextOfKinPhonesTable.label,
      isPrimary: employeeNextOfKinPhonesTable.isPrimary,
    })
    .from(employeeNextOfKinPhonesTable)
    .where(eq(employeeNextOfKinPhonesTable.kinId, kinId))
    .orderBy(employeeNextOfKinPhonesTable.createdAt);
}

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

  // Attach phones to each kin record
  const withPhones = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      phones: await getKinPhones(row.id),
    })),
  );
  res.json(withPhones);
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

  const { phones, ...kinFields } = parsed.data;

  const { kin, insertedPhones } = await db.transaction(async (tx) => {
    const [kin] = await tx
      .insert(employeeNextOfKinTable)
      .values({ ...kinFields, employeeId: params.data.id })
      .returning();

    let insertedPhones: typeof employeeNextOfKinPhonesTable.$inferSelect[] = [];
    if (phones.length > 0) {
      insertedPhones = await tx
        .insert(employeeNextOfKinPhonesTable)
        .values(phones.map((p) => ({ kinId: kin.id, ...p })))
        .returning();
    }

    return { kin, insertedPhones };
  });

  res.status(201).json({
    ...kin,
    phones: insertedPhones.map((p) => ({
      id: p.id,
      number: p.number,
      label: p.label,
      isPrimary: p.isPrimary,
    })),
  });
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
    const phones = await getKinPhones(updated.id);
    res.json({ ...updated, phones });
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
