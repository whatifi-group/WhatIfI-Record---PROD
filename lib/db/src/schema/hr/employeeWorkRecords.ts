import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const employeeWorkRecordsTable = pgTable(
  "employee_work_records",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    shiftDate: date("shift_date", { mode: "string" }).notNull(),
    startTime: text("start_time"), // HH:MM
    endTime: text("end_time"), // HH:MM
    hoursWorked: numeric("hours_worked", { precision: 6, scale: 2 }),
    shiftType: text("shift_type").notNull().default("regular"), // regular/overtime/on-call
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Covers the dominant paginated shift query: filter/order by date, scoped to employee
    index("ewr_shift_date_emp_idx").on(table.shiftDate, table.employeeId),
  ],
);

export const insertEmployeeWorkRecordSchema = createInsertSchema(
  employeeWorkRecordsTable,
).omit({ id: true, createdAt: true });
export type InsertEmployeeWorkRecord = z.infer<
  typeof insertEmployeeWorkRecordSchema
>;
export type EmployeeWorkRecord = typeof employeeWorkRecordsTable.$inferSelect;
