import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";
import { ListAuditLogQueryParams, ListAuditLogResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/sysadmin/audit-log", async (req, res): Promise<void> => {
  const query = ListAuditLogQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { module, userId, from, to, limit, offset } = query.data;

  const conditions: SQL[] = [];
  if (module) conditions.push(eq(auditLogTable.module, module));
  if (userId !== undefined) conditions.push(eq(auditLogTable.userId, userId));
  if (from) conditions.push(gte(auditLogTable.timestamp, from));
  if (to) conditions.push(lte(auditLogTable.timestamp, to));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(auditLogTable)
      .where(where)
      .orderBy(desc(auditLogTable.timestamp))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(auditLogTable)
      .where(where),
  ]);

  res.json(ListAuditLogResponse.parse({ items, total }));
});

export default router;
