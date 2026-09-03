import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { type Permission } from "./roles";
import { employeesTable } from "../hr/employees";

export const userStatusValues = ["active", "inactive", "suspended"] as const;

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    /**
     * PBKDF2 hash for break-glass password sign-in. Null for the normal case —
     * users authenticate through Microsoft Entra ID and never hold a password.
     * Only system accounts (`isSystemAccount`) may sign in with one; see
     * `POST /auth/login` in api-server's routes/auth.ts.
     */
    passwordHash: text("password_hash"),
    /**
     * Entra ID `oid` claim — the immutable per-tenant object id for this user.
     * Preferred over email for matching on sign-in because a UPN/mail address
     * can be renamed. Backfilled on a user's first SSO sign-in.
     */
    msEntraObjectId: text("ms_entra_object_id").unique(),
    // Value managed via List of Values (category "user_status"); see seedLov.ts.
    status: text("status").notNull().default("active"),
    // Individual permission overrides on top of role permissions
    permissions: jsonb("permissions").$type<Permission[]>().notNull().default([]),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** True for sysadmin/service accounts that exist independently of any employee record. */
    isSystemAccount: boolean("is_system_account").notNull().default(false),
    /** FK to employees; null for system accounts. Unique: one user per employee. */
    employeeId: integer("employee_id")
      .references(() => employeesTable.id, { onDelete: "cascade" })
      .unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Login always looks up by lowercased email; this constraint makes it
    // impossible for a write path to store a mixed-case email that would
    // silently become unreachable at login (see incident 2026-07-18/19).
    check("users_email_lowercase", sql`${table.email} = lower(${table.email})`),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserRow = typeof usersTable.$inferSelect;
