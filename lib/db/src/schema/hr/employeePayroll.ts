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

export const employeePayrollTable = pgTable("employee_payroll", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .unique()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  employeeNumber: text("employee_number"),
  niNumber: text("ni_number"),
  bankName: text("bank_name"),
  accountHolder: text("account_holder"),
  sortCode: text("sort_code"),
  accountNumber: text("account_number"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeePayrollSchema = createInsertSchema(
  employeePayrollTable,
).omit({ id: true, createdAt: true });
export type InsertEmployeePayroll = z.infer<typeof insertEmployeePayrollSchema>;
export type EmployeePayroll = typeof employeePayrollTable.$inferSelect;
