import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { departmentsTable } from "./departments";

export const employmentTypeValues = [
  "full_time",
  "part_time",
  "contract",
  "intern",
] as const;

export const employeeStatusValues = ["active", "inactive", "on_leave"] as const;

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  jobTitle: text("job_title").notNull(),
  departmentId: integer("department_id").references(
    () => departmentsTable.id,
    { onDelete: "set null" },
  ),
  employmentType: text("employment_type", {
    enum: employmentTypeValues,
  }).notNull(),
  status: text("status", { enum: employeeStatusValues })
    .notNull()
    .default("active"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  salary: numeric("salary", { precision: 12, scale: 2 }),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
