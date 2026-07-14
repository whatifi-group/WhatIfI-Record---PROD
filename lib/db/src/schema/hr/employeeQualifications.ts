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

export const employeeQualificationsTable = pgTable("employee_qualifications", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  institution: text("institution"),
  yearObtained: integer("year_obtained"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeeQualificationSchema = createInsertSchema(
  employeeQualificationsTable,
).omit({ id: true, createdAt: true });
export type InsertEmployeeQualification = z.infer<
  typeof insertEmployeeQualificationSchema
>;
export type EmployeeQualification =
  typeof employeeQualificationsTable.$inferSelect;
