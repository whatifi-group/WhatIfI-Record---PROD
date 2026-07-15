import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  date,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { employeesTable } from "./employees";
import { usersTable } from "../sysadmin/users";

// ---------------------------------------------------------------------------
// employee_disclosures
// ---------------------------------------------------------------------------

export const employeeDisclosuresTable = pgTable("employee_disclosures", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  checkType: text("check_type", {
    enum: ["dbs", "pvg", "access_ni"],
  }).notNull(),
  checkLevel: text("check_level", {
    enum: ["basic", "standard", "enhanced", "enhanced_barred"],
  }).notNull(),
  certificateNumber: text("certificate_number"),
  issueDate: date("issue_date", { mode: "string" }).notNull(),
  onUpdateService: boolean("on_update_service").notNull().default(false),
  convictionDetails: text("conviction_details"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeeDisclosureSchema = createInsertSchema(
  employeeDisclosuresTable,
);
export const selectEmployeeDisclosureSchema = createSelectSchema(
  employeeDisclosuresTable,
);

export type EmployeeDisclosure = typeof employeeDisclosuresTable.$inferSelect;
export type InsertEmployeeDisclosure =
  typeof employeeDisclosuresTable.$inferInsert;

// ---------------------------------------------------------------------------
// employee_disclosure_update_checks
// ---------------------------------------------------------------------------

export const employeeDisclosureUpdateChecksTable = pgTable(
  "employee_disclosure_update_checks",
  {
    id: serial("id").primaryKey(),
    disclosureId: integer("disclosure_id")
      .notNull()
      .references(() => employeeDisclosuresTable.id, { onDelete: "cascade" }),
    checkedDate: date("checked_date", { mode: "string" }).notNull(),
    result: text("result", {
      enum: ["clear", "not_clear", "changes_shown"],
    }).notNull(),
    checkedBy: text("checked_by").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const insertDisclosureUpdateCheckSchema = createInsertSchema(
  employeeDisclosureUpdateChecksTable,
);
export const selectDisclosureUpdateCheckSchema = createSelectSchema(
  employeeDisclosureUpdateChecksTable,
);

export type DisclosureUpdateCheck =
  typeof employeeDisclosureUpdateChecksTable.$inferSelect;
export type InsertDisclosureUpdateCheck =
  typeof employeeDisclosureUpdateChecksTable.$inferInsert;

// ---------------------------------------------------------------------------
// employee_disclosure_reviews
// ---------------------------------------------------------------------------

export const employeeDisclosureReviewsTable = pgTable(
  "employee_disclosure_reviews",
  {
    id: serial("id").primaryKey(),
    disclosureId: integer("disclosure_id")
      .notNull()
      .references(() => employeeDisclosuresTable.id, { onDelete: "cascade" })
      .unique(),
    recommendation: text("recommendation", {
      enum: ["approved", "not_approved", "further_review"],
    }).notNull(),
    reviewerNotes: text("reviewer_notes"),
    reviewDate: date("review_date", { mode: "string" }).notNull(),
    signedOffByUserId: integer("signed_off_by_user_id").references(
      () => usersTable.id,
    ),
    signedOffAt: timestamp("signed_off_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const insertDisclosureReviewSchema = createInsertSchema(
  employeeDisclosureReviewsTable,
);
export const selectDisclosureReviewSchema = createSelectSchema(
  employeeDisclosureReviewsTable,
);

export type DisclosureReview =
  typeof employeeDisclosureReviewsTable.$inferSelect;
export type InsertDisclosureReview =
  typeof employeeDisclosureReviewsTable.$inferInsert;
