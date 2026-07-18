import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, employeeAttachmentsTable } from "@workspace/db";
import { z } from "zod";
import { requirePermission } from "../../middlewares/requirePermission";

const router: IRouter = Router({ mergeParams: true });
const EDIT = ["hr:access", "sysadmin"];

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const AttachmentIdParam = z.object({
  id: z.coerce.number().int().positive(),
  attachmentId: z.coerce.number().int().positive(),
});

const AttachmentInput = z.object({
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  fileType: z.string().optional().nullable(),
  fileSizeBytes: z.number().int().optional().nullable(),
});

router.get("/employees/:id/attachments", requirePermission(EDIT), async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(employeeAttachmentsTable)
    .where(eq(employeeAttachmentsTable.employeeId, params.data.id))
    .orderBy(employeeAttachmentsTable.uploadedAt);
  res.json(rows);
});

router.post("/employees/:id/attachments", requirePermission(EDIT), async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AttachmentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(employeeAttachmentsTable)
    .values({ ...parsed.data, employeeId: params.data.id })
    .returning();
  res.status(201).json(created);
});

router.delete(
  "/employees/:id/attachments/:attachmentId",
  requirePermission(EDIT),
  async (req, res): Promise<void> => {
    const params = AttachmentIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(employeeAttachmentsTable)
      .where(
        and(
          eq(employeeAttachmentsTable.id, params.data.attachmentId),
          eq(employeeAttachmentsTable.employeeId, params.data.id),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
