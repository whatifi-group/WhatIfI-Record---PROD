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

export const employeeNextOfKinTable = pgTable("employee_next_of_kin", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relationship: text("relationship"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeeNextOfKinSchema = createInsertSchema(
  employeeNextOfKinTable,
).omit({ id: true, createdAt: true });
export type InsertEmployeeNextOfKin = z.infer<
  typeof insertEmployeeNextOfKinSchema
>;
export type EmployeeNextOfKin = typeof employeeNextOfKinTable.$inferSelect;
