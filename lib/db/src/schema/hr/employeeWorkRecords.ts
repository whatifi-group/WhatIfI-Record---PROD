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
import { employeesTable } from "./employees";

export const employeeWorkRecordsTable = pgTable("employee_work_records", {
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
});

export const insertEmployeeWorkRecordSchema = createInsertSchema(
  employeeWorkRecordsTable,
).omit({ id: true, createdAt: true });
export type InsertEmployeeWorkRecord = z.infer<
  typeof insertEmployeeWorkRecordSchema
>;
export type EmployeeWorkRecord = typeof employeeWorkRecordsTable.$inferSelect;
