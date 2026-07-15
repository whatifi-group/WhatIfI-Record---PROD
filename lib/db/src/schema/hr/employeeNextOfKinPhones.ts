import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { employeeNextOfKinTable } from "./employeeNextOfKin";

export const employeeNextOfKinPhonesTable = pgTable("employee_next_of_kin_phones", {
  id: serial("id").primaryKey(),
  kinId: integer("kin_id")
    .notNull()
    .references(() => employeeNextOfKinTable.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  label: text("label").notNull().default("Mobile"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmployeeNextOfKinPhone = typeof employeeNextOfKinPhonesTable.$inferSelect;
export type InsertEmployeeNextOfKinPhone = typeof employeeNextOfKinPhonesTable.$inferInsert;
