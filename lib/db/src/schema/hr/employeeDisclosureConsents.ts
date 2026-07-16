/**
 * employee_disclosure_update_service_consents
 *
 * Written at approval time for every onboarding submission that includes a
 * disclosure.  consent_granted = false records that the Update Service was not
 * applicable for this submission.
 */
import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { employeeDisclosuresTable } from "./employeeDisclosures";
import { employeeAttachmentsTable } from "./employeeAttachments";

export const employeeDisclosureConsentsTable = pgTable(
  "employee_disclosure_update_service_consents",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    disclosureId: integer("disclosure_id").references(
      () => employeeDisclosuresTable.id,
      { onDelete: "set null" },
    ),
    consentGranted: boolean("consent_granted").notNull().default(false),
    signatoryName: text("signatory_name"),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    pdfAttachmentId: integer("pdf_attachment_id").references(
      () => employeeAttachmentsTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type EmployeeDisclosureConsent =
  typeof employeeDisclosureConsentsTable.$inferSelect;
export type InsertEmployeeDisclosureConsent =
  typeof employeeDisclosureConsentsTable.$inferInsert;
