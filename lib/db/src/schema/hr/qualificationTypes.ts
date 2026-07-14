import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const qualificationTypesTable = pgTable("qualification_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  awardingBody: text("awarding_body"),
  validityValue: integer("validity_value"),
  /** "days" | "months" | "years" — null means no fixed expiry */
  validityUnit: text("validity_unit"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type QualificationType = typeof qualificationTypesTable.$inferSelect;
