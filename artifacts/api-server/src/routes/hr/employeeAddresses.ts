import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, employeeAddressesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const AddressIdParam = z.object({
  id: z.coerce.number().int().positive(),
  addressId: z.coerce.number().int().positive(),
});

const AddressInput = z.object({
  addressType: z.string().optional(),
  line1: z.string().min(1),
  line2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  county: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
});

const AddressUpdate = z.object({
  addressType: z.string().optional(),
  line1: z.string().min(1).optional(),
  line2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  county: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
});

router.get("/employees/:id/addresses", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(employeeAddressesTable)
    .where(eq(employeeAddressesTable.employeeId, params.data.id))
    .orderBy(employeeAddressesTable.createdAt);
  res.json(rows);
});

router.post("/employees/:id/addresses", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddressInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(employeeAddressesTable)
    .values({ ...parsed.data, employeeId: params.data.id })
    .returning();
  res.status(201).json(created);
});

router.patch(
  "/employees/:id/addresses/:addressId",
  async (req, res): Promise<void> => {
    const params = AddressIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = AddressUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(employeeAddressesTable)
      .set(parsed.data)
      .where(
        and(
          eq(employeeAddressesTable.id, params.data.addressId),
          eq(employeeAddressesTable.employeeId, params.data.id),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Address not found" });
      return;
    }
    res.json(updated);
  },
);

router.delete(
  "/employees/:id/addresses/:addressId",
  async (req, res): Promise<void> => {
    const params = AddressIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(employeeAddressesTable)
      .where(
        and(
          eq(employeeAddressesTable.id, params.data.addressId),
          eq(employeeAddressesTable.employeeId, params.data.id),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Address not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
