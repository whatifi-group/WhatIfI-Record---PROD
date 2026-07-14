import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rolesTable, type Permission } from "./roles";

export const userStatusValues = ["active", "inactive", "suspended"] as const;

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  status: text("status", { enum: userStatusValues })
    .notNull()
    .default("active"),
  roleId: integer("role_id")
    .notNull()
    .references(() => rolesTable.id),
  // Individual permission overrides on top of role permissions
  permissions: jsonb("permissions").$type<Permission[]>().notNull().default([]),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserRow = typeof usersTable.$inferSelect;
