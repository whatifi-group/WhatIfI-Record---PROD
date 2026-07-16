import {
  pgTable,
  serial,
  text,
  integer,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "../hr/employees";
import { departmentsTable } from "../hr/departments";
import { usersTable } from "../sysadmin/users";

export const onboardingStatusValues = [
  "pending",
  "approved",
  "rejected",
] as const;

export const onboardingSubmissionsTable = pgTable("onboarding_submissions", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  // These are now optional — HR sets job title and employment type at approval.
  jobTitle: text("job_title"),
  departmentId: integer("department_id").references(
    () => departmentsTable.id,
    { onDelete: "set null" },
  ),
  employmentType: text("employment_type"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  onboardingStatus: text("onboarding_status", {
    enum: onboardingStatusValues,
  })
    .notNull()
    .default("pending"),
  /** Set on approval or rejection — links to the created employee record. */
  employeeId: integer("employee_id").references(() => employeesTable.id, {
    onDelete: "set null",
  }),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedByUserId: integer("reviewed_by_user_id").references(
    () => usersTable.id,
    { onDelete: "set null" },
  ),
  /** Optional HR notes added at review time. */
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertOnboardingSubmissionSchema = createInsertSchema(
  onboardingSubmissionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertOnboardingSubmission = z.infer<
  typeof insertOnboardingSubmissionSchema
>;
export type OnboardingSubmission =
  typeof onboardingSubmissionsTable.$inferSelect;
