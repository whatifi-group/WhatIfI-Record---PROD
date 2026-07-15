import {
  pgTable,
  serial,
  integer,
  date,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const employeeServicePeriodsTable = pgTable(
  "employee_service_periods",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    endReason: text("end_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type EmployeeServicePeriod =
  typeof employeeServicePeriodsTable.$inferSelect;
