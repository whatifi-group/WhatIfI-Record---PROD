import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { qualificationTypesTable } from "./qualificationTypes";

export const employeeQualificationsTable = pgTable("employee_qualifications", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  qualificationTypeId: integer("qualification_type_id")
    .notNull()
    .references(() => qualificationTypesTable.id),
  dateAchieved: date("date_achieved").notNull(),
  expiryDate: date("expiry_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type EmployeeQualification =
  typeof employeeQualificationsTable.$inferSelect;
