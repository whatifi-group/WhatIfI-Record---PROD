import { Router, type IRouter } from "express";
import { ReportViewDurationBody } from "@workspace/api-zod";
import { recordViewDuration } from "../middlewares/auditLog";

const router: IRouter = Router();

// Not gated by any permission beyond being authenticated (see requireAuth,
// mounted ahead of this router in app.ts) — any user who could view a
// record is allowed to report having viewed it.
router.post("/audit-log/view-duration", async (req, res): Promise<void> => {
  const parsed = ReportViewDurationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await recordViewDuration({
    module: parsed.data.module,
    path: parsed.data.path,
    durationMs: parsed.data.durationMs,
    userId: req.session?.userId ?? null,
    ipAddress: req.ip ?? null,
    recordLabel: parsed.data.recordLabel,
  });

  res.sendStatus(204);
});

export default router;
