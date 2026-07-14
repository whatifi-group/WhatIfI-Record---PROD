import {
  pgTable,
  serial,
  text,
  integer,
  unique,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const employeeMedicalSelectionsTable = pgTable(
  "employee_medical_selections",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    lovValue: text("lov_value").notNull(),
  },
);

export const employeeMedicalNotesTable = pgTable("employee_medical_notes", {
  employeeId: integer("employee_id")
    .primaryKey()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeeMedicalSelectionSchema = createInsertSchema(
  employeeMedicalSelectionsTable,
).omit({ id: true });
export type InsertEmployeeMedicalSelection = z.infer<
  typeof insertEmployeeMedicalSelectionSchema
>;

export const insertEmployeeMedicalNotesSchema = createInsertSchema(
  employeeMedicalNotesTable,
).omit({ updatedAt: true });
export type InsertEmployeeMedicalNotes = z.infer<
  typeof insertEmployeeMedicalNotesSchema
>;
