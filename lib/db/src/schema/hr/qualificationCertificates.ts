import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { employeeQualificationsTable } from "./employeeQualifications";

export const qualificationCertificatesTable = pgTable(
  "qualification_certificates",
  {
    id: serial("id").primaryKey(),
    qualificationId: integer("qualification_id")
      .notNull()
      .references(() => employeeQualificationsTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    mimeType: text("mime_type"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type QualificationCertificate =
  typeof qualificationCertificatesTable.$inferSelect;
