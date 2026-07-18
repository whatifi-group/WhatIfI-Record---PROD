import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, notificationSettingsTable } from "@workspace/db";
import { NOTIFICATION_TEMPLATES } from "../../lib/seedNotificationSettings";

// Permission enforcement is applied once at the router-mount level
// (see routes/sysadmin/index.ts) — every route here requires "sysadmin".
const router: IRouter = Router();

const METADATA_BY_KEY = new Map(NOTIFICATION_TEMPLATES.map((t) => [t.key, t]));

// GET /sysadmin/notification-settings — all templates, merged with static
// metadata (label, description, available placeholders, whether the
// recipient list is editable) that isn't stored in the DB.
router.get("/sysadmin/notification-settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(notificationSettingsTable);

  const merged = rows.map((row) => {
    const meta = METADATA_BY_KEY.get(row.key);
    return {
      key: row.key,
      recipients: row.recipients,
      subject: row.subject,
      bodyText: row.bodyText,
      updatedAt: row.updatedAt,
      label: meta?.label ?? row.key,
      description: meta?.description ?? "",
      placeholders: meta?.placeholders ?? [],
      recipientsEditable: meta?.recipientsEditable ?? true,
    };
  });

  res.json(merged);
});

const UpdateNotificationSettingBody = z.object({
  recipients: z.string().nullable().optional(),
  subject: z.string().min(1).optional(),
  bodyText: z.string().min(1).optional(),
});

// PATCH /sysadmin/notification-settings/:key
router.patch(
  "/sysadmin/notification-settings/:key",
  async (req, res): Promise<void> => {
    const { key } = req.params;

    const [existing] = await db
      .select({ id: notificationSettingsTable.id })
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.key, key))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Unknown notification template" });
      return;
    }

    const parsed = UpdateNotificationSettingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const meta = METADATA_BY_KEY.get(key);
    if (parsed.data.recipients !== undefined && meta && !meta.recipientsEditable) {
      res.status(400).json({
        error: `${meta.label} always goes to a fixed recipient determined by the app — recipients aren't editable here.`,
      });
      return;
    }

    const [updated] = await db
      .update(notificationSettingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(notificationSettingsTable.key, key))
      .returning();

    res.json(updated);
  },
);

export default router;
