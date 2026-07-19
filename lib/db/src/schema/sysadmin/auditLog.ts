import { pgTable, bigserial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * System-wide audit trail. One row per API request handled by the app.
 *
 * `module` and `action` are derived automatically by the audit middleware
 * (see api-server/src/middlewares/auditLog.ts) from the mounted router and
 * the request's method + path — new modules are captured as soon as they're
 * mounted in routes/index.ts, with no changes needed here.
 *
 * `timestamp` is stored `timestamptz`, i.e. UTC, which is equivalent to GMT.
 */
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    module: text("module").notNull(),
    action: text("action").notNull(),
    // Nullable: public/unauthenticated requests (e.g. a failed login) still get audited.
    userId: integer("user_id"),
    // Snapshot of the acting user's name/email at the time of the action, so
    // the trail stays readable even after a user is renamed or deleted.
    userName: text("user_name"),
    method: text("method").notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull(),
    ipAddress: text("ip_address"),
    // Set only for client-reported "record view" events (method "VIEW") — how
    // long a record detail page stayed open. See routes/auditLog.ts.
    durationMs: integer("duration_ms"),
  },
  (table) => [
    index("audit_log_timestamp_idx").on(table.timestamp),
    index("audit_log_module_idx").on(table.module),
    index("audit_log_user_id_idx").on(table.userId),
  ],
);

export type AuditLogRow = typeof auditLogTable.$inferSelect;
export type InsertAuditLog = typeof auditLogTable.$inferInsert;
