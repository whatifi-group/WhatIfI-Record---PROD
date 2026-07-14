import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const employeeAttachmentsTable = pgTable("employee_attachments", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  fileSizeBytes: integer("file_size_bytes"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeeAttachmentSchema = createInsertSchema(
  employeeAttachmentsTable,
).omit({ id: true, uploadedAt: true });
export type InsertEmployeeAttachment = z.infer<
  typeof insertEmployeeAttachmentSchema
>;
export type EmployeeAttachment = typeof employeeAttachmentsTable.$inferSelect;
