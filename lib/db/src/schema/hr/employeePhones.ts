import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const phoneLabelValues = ["Mobile", "Home", "Work", "Other"] as const;
export type PhoneLabel = typeof phoneLabelValues[number];

export const employeePhonesTable = pgTable("employee_phones", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  label: text("label").notNull().default("Mobile"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmployeePhone = typeof employeePhonesTable.$inferSelect;
export type InsertEmployeePhone = typeof employeePhonesTable.$inferInsert;
