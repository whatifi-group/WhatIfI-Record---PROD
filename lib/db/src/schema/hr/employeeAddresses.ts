import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const employeeAddressesTable = pgTable("employee_addresses", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  addressType: text("address_type").notNull().default("home"), // home/work/other
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city"),
  county: text("county"),
  postcode: text("postcode"),
  country: text("country"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeeAddressSchema = createInsertSchema(
  employeeAddressesTable,
).omit({ id: true, createdAt: true });
export type InsertEmployeeAddress = z.infer<typeof insertEmployeeAddressSchema>;
export type EmployeeAddress = typeof employeeAddressesTable.$inferSelect;
