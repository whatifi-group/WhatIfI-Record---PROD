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

// List-of-Values items — the editable options for every dropdown in the app.
// `category` is a stable slug (e.g. "employment_type", "leave_type").
// `value`    is the stored string written to other tables.
// `label`    is the human-readable display name shown in the UI.
// `isSystem` items can be relabelled but not deleted.
export const lovItemsTable = pgTable("lov_items", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  value: text("value").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertLovItemSchema = createInsertSchema(lovItemsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLovItem = z.infer<typeof insertLovItemSchema>;
export type LovItemRow = typeof lovItemsTable.$inferSelect;
