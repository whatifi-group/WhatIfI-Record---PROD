import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

/**
 * Canonical list of shift type values — the single source of truth for the
 * `shift_type` LOV category.  Adding a value here is sufficient: seedLov.ts
 * derives its entries from this constant automatically.
 */
export const shiftTypeValues = [
  "standard",
  "overtime",
  "night_shift",
  "weekend",
  "bank_holiday",
  "on_call",
] as const;
export type ShiftType = (typeof shiftTypeValues)[number];

export const employeePayRatesTable = pgTable("employee_pay_rates", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  shiftType: text("shift_type").notNull(), // LOV value from shift_type category
  rate: numeric("rate", { precision: 10, scale: 2 }).notNull(),
  rateUnit: text("rate_unit").notNull().default("hourly"), // hourly | daily | flat
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeePayRateSchema = createInsertSchema(
  employeePayRatesTable,
).omit({ id: true, createdAt: true });
export type InsertEmployeePayRate = z.infer<typeof insertEmployeePayRateSchema>;
export type EmployeePayRate = typeof employeePayRatesTable.$inferSelect;
