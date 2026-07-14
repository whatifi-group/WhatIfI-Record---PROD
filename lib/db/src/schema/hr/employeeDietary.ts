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

export const employeeDietarySelectionsTable = pgTable(
  "employee_dietary_selections",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    lovValue: text("lov_value").notNull(),
  },
);

export const employeeDietaryNotesTable = pgTable("employee_dietary_notes", {
  employeeId: integer("employee_id")
    .primaryKey()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeeDietarySelectionSchema = createInsertSchema(
  employeeDietarySelectionsTable,
).omit({ id: true });
export type InsertEmployeeDietarySelection = z.infer<
  typeof insertEmployeeDietarySelectionSchema
>;

export const insertEmployeeDietaryNotesSchema = createInsertSchema(
  employeeDietaryNotesTable,
).omit({ updatedAt: true });
export type InsertEmployeeDietaryNotes = z.infer<
  typeof insertEmployeeDietaryNotesSchema
>;
