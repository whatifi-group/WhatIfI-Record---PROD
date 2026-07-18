/**
 * Onboarding staging tables — temporary storage of extended form data
 * collected by new hires during onboarding.  On approval these rows are
 * copied into the proper employee tables and the staging rows remain for
 * audit purposes.
 */
import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { onboardingSubmissionsTable } from "./onboardingSubmissions";

// ── Address ──────────────────────────────────────────────────────────────────

export const onboardingAddressesTable = pgTable("onboarding_addresses", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .notNull()
    .references(() => onboardingSubmissionsTable.id, { onDelete: "cascade" }),
  line1: text("line1"),
  line2: text("line2"),
  city: text("city"),
  county: text("county"),
  postcode: text("postcode"),
  country: text("country"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OnboardingAddress = typeof onboardingAddressesTable.$inferSelect;
export type InsertOnboardingAddress =
  typeof onboardingAddressesTable.$inferInsert;

// ── Next of Kin ──────────────────────────────────────────────────────────────

export const onboardingNextOfKinTable = pgTable("onboarding_next_of_kin", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .notNull()
    .references(() => onboardingSubmissionsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relationship: text("relationship"),
  email: text("email"),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OnboardingNextOfKin = typeof onboardingNextOfKinTable.$inferSelect;
export type InsertOnboardingNextOfKin =
  typeof onboardingNextOfKinTable.$inferInsert;

// ── Next of Kin phones ───────────────────────────────────────────────────────

export const onboardingNextOfKinPhonesTable = pgTable(
  "onboarding_next_of_kin_phones",
  {
    id: serial("id").primaryKey(),
    kinId: integer("kin_id")
      .notNull()
      .references(() => onboardingNextOfKinTable.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    label: text("label").notNull().default("Mobile"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type OnboardingNextOfKinPhone =
  typeof onboardingNextOfKinPhonesTable.$inferSelect;
export type InsertOnboardingNextOfKinPhone =
  typeof onboardingNextOfKinPhonesTable.$inferInsert;

// ── Medical & Dietary ────────────────────────────────────────────────────────

export const onboardingMedicalTable = pgTable("onboarding_medical", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .notNull()
    .references(() => onboardingSubmissionsTable.id, { onDelete: "cascade" }),
  medicalSelections: text("medical_selections").array(),
  medicalNotes: text("medical_notes"),
  dietarySelections: text("dietary_selections").array(),
  dietaryNotes: text("dietary_notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OnboardingMedical = typeof onboardingMedicalTable.$inferSelect;
export type InsertOnboardingMedical =
  typeof onboardingMedicalTable.$inferInsert;

// ── Disclosure ───────────────────────────────────────────────────────────────

export const onboardingDisclosuresTable = pgTable("onboarding_disclosures", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .notNull()
    .references(() => onboardingSubmissionsTable.id, { onDelete: "cascade" }),
  checkType: text("check_type").notNull(), // dbs | pvg | access_ni
  checkLevel: text("check_level").notNull(), // basic | standard | enhanced | enhanced_barred
  certificateNumber: text("certificate_number"),
  issueDate: date("issue_date", { mode: "string" }),
  onUpdateService: boolean("on_update_service").notNull().default(false),
  updateServiceConsentName: text("update_service_consent_name"),
  convictionDetails: text("conviction_details"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OnboardingDisclosure =
  typeof onboardingDisclosuresTable.$inferSelect;
export type InsertOnboardingDisclosure =
  typeof onboardingDisclosuresTable.$inferInsert;

// ── Payroll / Bank Details ───────────────────────────────────────────────────

export const onboardingPayrollTable = pgTable("onboarding_payroll", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .notNull()
    .references(() => onboardingSubmissionsTable.id, { onDelete: "cascade" }),
  niNumber: text("ni_number"),
  bankName: text("bank_name"),
  accountHolder: text("account_holder"),
  sortCode: text("sort_code"),
  accountNumber: text("account_number"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OnboardingPayroll = typeof onboardingPayrollTable.$inferSelect;
export type InsertOnboardingPayroll =
  typeof onboardingPayrollTable.$inferInsert;
