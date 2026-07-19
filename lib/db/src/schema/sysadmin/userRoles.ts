import { pgTable, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { rolesTable } from "./roles";

export const userRolesTable = pgTable(
  "user_roles",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => rolesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export type UserRole = typeof userRolesTable.$inferSelect;
export type InsertUserRole = typeof userRolesTable.$inferInsert;
