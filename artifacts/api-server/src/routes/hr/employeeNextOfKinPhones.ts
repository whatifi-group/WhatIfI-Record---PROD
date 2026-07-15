/**
 * Next-of-kin phone-number CRUD.
 *
 * GET    /api/employees/:id/next-of-kin/:kinId/phones
 * POST   /api/employees/:id/next-of-kin/:kinId/phones
 * PATCH  /api/employees/:id/next-of-kin/:kinId/phones/:phoneId
 * DELETE /api/employees/:id/next-of-kin/:kinId/phones/:phoneId
 *
 * Business rules: at most one primary per kin record (auto-demotion).
 * Auth: requires edit_employees or sysadmin.
 */
import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, employeeNextOfKinPhonesTable } from "@workspace/db";
import { requirePermission } from "../../middlewares/requirePermission";

const router: IRouter = Router({ mergeParams: true });

const KinParam = z.object({
  id: z.coerce.number().int().positive(),
  kinId: z.coerce.number().int().positive(),
});
const PhoneParam = z.object({
  id: z.coerce.number().int().positive(),
  kinId: z.coerce.number().int().positive(),
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
  "/employees/:id/next-of-kin/:kinId/phones",
  requirePermission(["edit_employees", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = KinParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await db
      .select()
      .from(employeeNextOfKinPhonesTable)
      .where(eq(employeeNextOfKinPhonesTable.kinId, params.data.kinId))
      .orderBy(employeeNextOfKinPhonesTable.createdAt);
    res.json(rows);
  },
);

// ── POST ─────────────────────────────────────────────────────────────────────

router.post(
  "/employees/:id/next-of-kin/:kinId/phones",
  requirePermission(["edit_employees", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = KinParam.safeParse(req.params);
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
      if (parsed.data.isPrimary) {
        await tx
          .update(employeeNextOfKinPhonesTable)
          .set({ isPrimary: false })
          .where(
            and(
              eq(employeeNextOfKinPhonesTable.kinId, params.data.kinId),
              eq(employeeNextOfKinPhonesTable.isPrimary, true),
            ),
          );
      }
      const [row] = await tx
        .insert(employeeNextOfKinPhonesTable)
        .values({ ...parsed.data, kinId: params.data.kinId })
        .returning();
      return row;
    });

    res.status(201).json(created);
  },
);

// ── PATCH ────────────────────────────────────────────────────────────────────

router.patch(
  "/employees/:id/next-of-kin/:kinId/phones/:phoneId",
  requirePermission(["edit_employees", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = PhoneParam.safeParse(req.params);
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
          .update(employeeNextOfKinPhonesTable)
          .set({ isPrimary: false })
          .where(
            and(
              eq(employeeNextOfKinPhonesTable.kinId, params.data.kinId),
              eq(employeeNextOfKinPhonesTable.isPrimary, true),
            ),
          );
      }
      const [row] = await tx
        .update(employeeNextOfKinPhonesTable)
        .set(parsed.data)
        .where(
          and(
            eq(employeeNextOfKinPhonesTable.id, params.data.phoneId),
            eq(employeeNextOfKinPhonesTable.kinId, params.data.kinId),
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
  "/employees/:id/next-of-kin/:kinId/phones/:phoneId",
  requirePermission(["edit_employees", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = PhoneParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(employeeNextOfKinPhonesTable)
      .where(
        and(
          eq(employeeNextOfKinPhonesTable.id, params.data.phoneId),
          eq(employeeNextOfKinPhonesTable.kinId, params.data.kinId),
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
