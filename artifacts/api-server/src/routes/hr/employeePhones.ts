/**
 * Employee phone-number CRUD.
 *
 * GET    /api/employees/:id/phones
 * POST   /api/employees/:id/phones
 * PATCH  /api/employees/:id/phones/:phoneId
 * DELETE /api/employees/:id/phones/:phoneId
 *
 * Business rules:
 *  - At most one phone per employee may have isPrimary = true.
 *    Setting isPrimary on any entry automatically demotes the previous primary.
 *  - Requires edit_employees or sysadmin.
 */
import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, employeePhonesTable } from "@workspace/db";
import { requirePermission } from "../../middlewares/requirePermission";

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const PhoneIdParam = z.object({
  id: z.coerce.number().int().positive(),
  phoneId: z.coerce.number().int().positive(),
});

const PHONE_LABELS = ["Mobile", "Home", "Work", "Other"] as const;

const PhoneInput = z.object({
  number: z.string().min(1),
  label: z.enum(PHONE_LABELS).default("Mobile"),
  isPrimary: z.boolean().default(false),
});

const PhoneUpdate = z.object({
  number: z.string().min(1).optional(),
  label: z.enum(PHONE_LABELS).optional(),
  isPrimary: z.boolean().optional(),
});

// ── GET ──────────────────────────────────────────────────────────────────────

router.get(
  "/employees/:id/phones",
  requirePermission(["edit_employees", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await db
      .select()
      .from(employeePhonesTable)
      .where(eq(employeePhonesTable.employeeId, params.data.id))
      .orderBy(employeePhonesTable.createdAt);
    res.json(rows);
  },
);

// ── POST ─────────────────────────────────────────────────────────────────────

router.post(
  "/employees/:id/phones",
  requirePermission(["edit_employees", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = PhoneInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const created = await db.transaction(async (tx) => {
      // Demote existing primary when new one is being set
      if (parsed.data.isPrimary) {
        await tx
          .update(employeePhonesTable)
          .set({ isPrimary: false })
          .where(
            and(
              eq(employeePhonesTable.employeeId, params.data.id),
              eq(employeePhonesTable.isPrimary, true),
            ),
          );
      }
      const [row] = await tx
        .insert(employeePhonesTable)
        .values({ ...parsed.data, employeeId: params.data.id })
        .returning();
      return row;
    });

    res.status(201).json(created);
  },
);

// ── PATCH ────────────────────────────────────────────────────────────────────

router.patch(
  "/employees/:id/phones/:phoneId",
  requirePermission(["edit_employees", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = PhoneIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = PhoneUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      if (parsed.data.isPrimary) {
        await tx
          .update(employeePhonesTable)
          .set({ isPrimary: false })
          .where(
            and(
              eq(employeePhonesTable.employeeId, params.data.id),
              eq(employeePhonesTable.isPrimary, true),
            ),
          );
      }
      const [row] = await tx
        .update(employeePhonesTable)
        .set(parsed.data)
        .where(
          and(
            eq(employeePhonesTable.id, params.data.phoneId),
            eq(employeePhonesTable.employeeId, params.data.id),
          ),
        )
        .returning();
      return row;
    });

    if (!updated) {
      res.status(404).json({ error: "Phone not found" });
      return;
    }
    res.json(updated);
  },
);

// ── DELETE ───────────────────────────────────────────────────────────────────

router.delete(
  "/employees/:id/phones/:phoneId",
  requirePermission(["edit_employees", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = PhoneIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(employeePhonesTable)
      .where(
        and(
          eq(employeePhonesTable.id, params.data.phoneId),
          eq(employeePhonesTable.employeeId, params.data.id),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Phone not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
