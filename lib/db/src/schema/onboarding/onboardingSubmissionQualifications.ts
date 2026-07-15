import {
  pgTable,
  serial,
  integer,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { onboardingSubmissionsTable } from "./onboardingSubmissions";
import { qualificationTypesTable } from "../hr/qualificationTypes";

export const onboardingSubmissionQualificationsTable = pgTable(
  "onboarding_submission_qualifications",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id")
      .notNull()
      .references(() => onboardingSubmissionsTable.id, { onDelete: "cascade" }),
    qualificationTypeId: integer("qualification_type_id")
      .notNull()
      .references(() => qualificationTypesTable.id, { onDelete: "restrict" }),
    dateAchieved: date("date_achieved", { mode: "string" }).notNull(),
    expiryDate: date("expiry_date", { mode: "string" }),
    notes: text("notes"),
    /** Original file name of the certificate, if any. */
    fileName: text("file_name"),
    /** Object storage path or external URL of the certificate. */
    fileUrl: text("file_url"),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type OnboardingSubmissionQualification =
  typeof onboardingSubmissionQualificationsTable.$inferSelect;
