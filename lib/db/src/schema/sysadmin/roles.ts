import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const permissionValues = [
  "sysadmin",
  "hr:access",
  "hr:past_employees",
  "hr_admin",
  "view_employees",
  "edit_employees",
  "delete_employees",
  "view_departments",
  "edit_departments",
  "view_leave",
  "manage_leave",
  "view_reports",
] as const;

export type Permission = (typeof permissionValues)[number];

export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  permissions: jsonb("permissions").$type<Permission[]>().notNull().default([]),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertRoleSchema = createInsertSchema(rolesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type RoleRow = typeof rolesTable.$inferSelect;
