import {
  pgTable,
  serial,
  integer,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { employeeQualificationsTable } from "./employeeQualifications";

export const qualificationRevalidationsTable = pgTable(
  "qualification_revalidations",
  {
    id: serial("id").primaryKey(),
    qualificationId: integer("qualification_id")
      .notNull()
      .references(() => employeeQualificationsTable.id, { onDelete: "cascade" }),
    previousDateAchieved: date("previous_date_achieved").notNull(),
    previousExpiryDate: date("previous_expiry_date"),
    revalidatedAt: timestamp("revalidated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
  },
);

export type QualificationRevalidation =
  typeof qualificationRevalidationsTable.$inferSelect;
