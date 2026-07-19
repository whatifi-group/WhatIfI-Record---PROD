import { pgTable, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { departmentsTable } from "./departments";

export const employeeDepartmentsTable = pgTable(
  "employee_departments",
  {
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.employeeId, table.departmentId] })],
);

export type EmployeeDepartment = typeof employeeDepartmentsTable.$inferSelect;
export type InsertEmployeeDepartment = typeof employeeDepartmentsTable.$inferInsert;
