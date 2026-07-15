#!/usr/bin/env node
// Builds 0003_snapshot.json — a drizzle-kit meta snapshot that reflects the
// full Drizzle schema state after all migrations 0000–0009 have been applied.
//
// Rules for snapshot accuracy:
//  - Only include tables that have a pgTable() definition in src/schema/
//  - FK names must follow the drizzle convention: {tableFrom}_{colFrom}_{tableTo}_{colTo}_fk
//  - Do NOT include check constraints (drizzle text({ enum }) does not emit them)
//  - Do NOT include manually-created indexes that aren't in the Drizzle schema
//  - Column defaults must match what drizzle generates (no invented defaults)
//
// Run: node lib/db/scripts/build-snapshot.mjs

import fs from "fs/promises";

const metaDir = new URL("../drizzle/meta/", import.meta.url).pathname;
const base = JSON.parse(await fs.readFile(`${metaDir}/0002_snapshot.json`, "utf8"));

// ── helpers ──────────────────────────────────────────────────────────────────
const col   = (name, type, opts = {}) => ({ name, type, primaryKey: false, notNull: false, ...opts });
const serial= (name)        => ({ name, type: "serial", primaryKey: true, notNull: true });
const text  = (name, o={})  => col(name, "text",    o);
const int   = (name, o={})  => col(name, "integer", o);
const bool  = (name, o={})  => col(name, "boolean", o);
const ts    = (name, o={})  => col(name, "timestamp with time zone", { default: "now()", notNull: true, ...o });
const datec = (name, o={})  => col(name, "date",    o);

// drizzle FK naming: {tableFrom}_{colFrom}_{tableTo}_{colTo}_fk
const fk = (name, tableFrom, tableTo, colFrom, colTo, onDelete = "no action") => ({
  [name]: { name, tableFrom, tableTo, schemaTo: "public", columnsFrom: [colFrom], columnsTo: [colTo], onDelete, onUpdate: "no action" },
});

const table = (name, columns, indexes = {}, foreignKeys = {}, uniqueConstraints = {}) => ({
  name, schema: "",
  columns, indexes, foreignKeys,
  compositePrimaryKeys: {},
  uniqueConstraints,
  policies: {},
  checkConstraints: {},   // always empty — drizzle text({ enum }) emits no CHECK constraints
  isRLSEnabled: false,
});

// ── 1. patch employees – add leaver_reason / leaver_date ─────────────────────
const emp = base.tables["public.employees"];
emp.columns["leaver_reason"] = text("leaver_reason");
emp.columns["leaver_date"]   = datec("leaver_date");
emp.policies         = {};
emp.checkConstraints = {};
emp.isRLSEnabled     = false;

// ── 2. patch employee_pay_rates – add effective columns, drop old unique ──────
const epr = base.tables["public.employee_pay_rates"];
epr.columns["effective_from"] = datec("effective_from", { notNull: true, default: "CURRENT_DATE" });
epr.columns["effective_to"]   = datec("effective_to");
delete epr.uniqueConstraints["employee_pay_rates_employee_id_shift_type_unique"];
epr.policies         = {};
epr.checkConstraints = {};
epr.isRLSEnabled     = false;

// ── 3. patch employee_work_records – add composite index ─────────────────────
const ewr = base.tables["public.employee_work_records"];
ewr.indexes = ewr.indexes || {};
ewr.indexes["ewr_shift_date_emp_idx"] = {
  name: "ewr_shift_date_emp_idx",
  columns: [
    { expression: "shift_date",  isExpression: false, asc: true, nulls: "last" },
    { expression: "employee_id", isExpression: false, asc: true, nulls: "last" },
  ],
  isUnique: false, concurrently: false, method: "btree", with: {},
};
ewr.policies         = ewr.policies || {};
ewr.checkConstraints = {};
ewr.isRLSEnabled     = false;

// ── 4. patch users – employee_id must have no default (drizzle emits none) ───
base.tables["public.users"].columns["employee_id"] =
  int("employee_id");           // notNull: false, no default
// ensure checkConstraints / policies exist on all pre-existing tables
for (const t of Object.values(base.tables)) {
  t.policies         = t.policies || {};
  t.checkConstraints = t.checkConstraints || {};
  if (t.isRLSEnabled === undefined) t.isRLSEnabled = false;
}

// ── 5. password_reset_tokens (no manual indexes — they're not in Drizzle schema)
base.tables["public.password_reset_tokens"] = table(
  "password_reset_tokens",
  {
    id:         serial("id"),
    user_id:    int("user_id",     { notNull: true }),
    token:      text("token",      { notNull: true }),
    expires_at: ts("expires_at",   { default: undefined }),   // notNull, no default
    used_at:    ts("used_at",      { notNull: false, default: undefined }),
    created_at: ts("created_at"),
  },
  {},   // no drizzle-managed indexes
  fk("password_reset_tokens_user_id_users_id_fk", "password_reset_tokens", "users", "user_id", "id", "cascade"),
  { "password_reset_tokens_token_unique": { name: "password_reset_tokens_token_unique", nullsNotDistinct: false, columns: ["token"] } },
);

// NOTE: user_sessions is created by connect-pg-simple with raw SQL.
// There is no pgTable() definition for it, so it must NOT appear in the snapshot.

// ── 6. employee_service_periods ───────────────────────────────────────────────
base.tables["public.employee_service_periods"] = table(
  "employee_service_periods",
  {
    id:          serial("id"),
    employee_id: int("employee_id", { notNull: true }),
    start_date:  datec("start_date", { notNull: true }),
    end_date:    datec("end_date"),
    end_reason:  text("end_reason"),
    notes:       text("notes"),
    created_at:  ts("created_at"),
    updated_at:  ts("updated_at"),
  },
  {},
  fk("employee_service_periods_employee_id_employees_id_fk", "employee_service_periods", "employees", "employee_id", "id", "cascade"),
);

// ── 7. qualification_types ────────────────────────────────────────────────────
base.tables["public.qualification_types"] = table(
  "qualification_types",
  {
    id:             serial("id"),
    name:           text("name",          { notNull: true }),
    awarding_body:  text("awarding_body"),
    validity_value: int("validity_value"),
    validity_unit:  text("validity_unit"),
    is_active:      bool("is_active",     { notNull: true, default: true }),
    created_at:     ts("created_at"),
  },
  {},
  {},
  { "qualification_types_name_unique": { name: "qualification_types_name_unique", nullsNotDistinct: false, columns: ["name"] } },
);

// ── 8. employee_qualifications (schema changed: type_id FK + dates) ───────────
base.tables["public.employee_qualifications"] = table(
  "employee_qualifications",
  {
    id:                    serial("id"),
    employee_id:           int("employee_id",           { notNull: true }),
    qualification_type_id: int("qualification_type_id", { notNull: true }),
    date_achieved:         datec("date_achieved",        { notNull: true }),
    expiry_date:           datec("expiry_date"),
    notes:                 text("notes"),
    created_at:            ts("created_at"),
  },
  {},
  {
    ...fk("employee_qualifications_employee_id_employees_id_fk",
          "employee_qualifications", "employees",          "employee_id",           "id", "cascade"),
    ...fk("employee_qualifications_qualification_type_id_qualification_types_id_fk",
          "employee_qualifications", "qualification_types","qualification_type_id", "id", "no action"),
  },
);

// ── 9. qualification_certificates ────────────────────────────────────────────
base.tables["public.qualification_certificates"] = table(
  "qualification_certificates",
  {
    id:               serial("id"),
    qualification_id: int("qualification_id", { notNull: true }),
    file_name:        text("file_name",        { notNull: true }),
    file_url:         text("file_url",         { notNull: true }),
    mime_type:        text("mime_type"),
    uploaded_at:      ts("uploaded_at"),
  },
  {},
  fk("qualification_certificates_qualification_id_employee_qualifications_id_fk",
     "qualification_certificates", "employee_qualifications", "qualification_id", "id", "cascade"),
);

// ── 10. qualification_revalidations ──────────────────────────────────────────
base.tables["public.qualification_revalidations"] = table(
  "qualification_revalidations",
  {
    id:                     serial("id"),
    qualification_id:       int("qualification_id",        { notNull: true }),
    previous_date_achieved: datec("previous_date_achieved",{ notNull: true }),
    previous_expiry_date:   datec("previous_expiry_date"),
    revalidated_at:         ts("revalidated_at"),
    notes:                  text("notes"),
  },
  {},
  fk("qualification_revalidations_qualification_id_employee_qualifications_id_fk",
     "qualification_revalidations", "employee_qualifications", "qualification_id", "id", "cascade"),
);

// ── 11. onboarding_submissions ────────────────────────────────────────────────
base.tables["public.onboarding_submissions"] = table(
  "onboarding_submissions",
  {
    id:                  serial("id"),
    first_name:          text("first_name",        { notNull: true }),
    last_name:           text("last_name",         { notNull: true }),
    email:               text("email",             { notNull: true }),
    phone:               text("phone"),
    job_title:           text("job_title",         { notNull: true }),
    department_id:       int("department_id"),
    employment_type:     text("employment_type",   { notNull: true }),
    start_date:          datec("start_date",        { notNull: true }),
    onboarding_status:   text("onboarding_status", { notNull: true, default: "'pending'" }),
    employee_id:         int("employee_id"),
    submitted_at:        ts("submitted_at"),
    reviewed_at:         ts("reviewed_at",         { notNull: false, default: undefined }),
    reviewed_by_user_id: int("reviewed_by_user_id"),
    review_notes:        text("review_notes"),
    created_at:          ts("created_at"),
    updated_at:          ts("updated_at"),
  },
  {},
  {
    ...fk("onboarding_submissions_department_id_departments_id_fk",
          "onboarding_submissions", "departments", "department_id",       "id", "set null"),
    ...fk("onboarding_submissions_employee_id_employees_id_fk",
          "onboarding_submissions", "employees",   "employee_id",         "id", "set null"),
    ...fk("onboarding_submissions_reviewed_by_user_id_users_id_fk",
          "onboarding_submissions", "users",       "reviewed_by_user_id", "id", "set null"),
  },
);

// ── 12. onboarding_submission_qualifications ──────────────────────────────────
base.tables["public.onboarding_submission_qualifications"] = table(
  "onboarding_submission_qualifications",
  {
    id:                    serial("id"),
    submission_id:         int("submission_id",          { notNull: true }),
    qualification_type_id: int("qualification_type_id",  { notNull: true }),
    date_achieved:         datec("date_achieved",          { notNull: true }),
    expiry_date:           datec("expiry_date"),
    notes:                 text("notes"),
    file_name:             text("file_name"),
    file_url:              text("file_url"),
    mime_type:             text("mime_type"),
    created_at:            ts("created_at"),
  },
  {},
  {
    ...fk("onboarding_submission_qualifications_submission_id_onboarding_submissions_id_fk",
          "onboarding_submission_qualifications", "onboarding_submissions", "submission_id",         "id", "cascade"),
    ...fk("onboarding_submission_qualifications_qualification_type_id_qualification_types_id_fk",
          "onboarding_submission_qualifications", "qualification_types",    "qualification_type_id", "id", "restrict"),
  },
);

// ── 13. employee_disclosures ──────────────────────────────────────────────────
// drizzle text({ enum }) emits NO check constraints — checkConstraints stays {}
base.tables["public.employee_disclosures"] = table(
  "employee_disclosures",
  {
    id:                 serial("id"),
    employee_id:        int("employee_id",         { notNull: true }),
    check_type:         text("check_type",         { notNull: true }),
    check_level:        text("check_level",        { notNull: true }),
    certificate_number: text("certificate_number"),
    issue_date:         datec("issue_date",          { notNull: true }),
    on_update_service:  bool("on_update_service",   { notNull: true, default: false }),
    conviction_details: text("conviction_details"),
    notes:              text("notes"),
    created_at:         ts("created_at"),
    updated_at:         ts("updated_at"),
  },
  {},
  fk("employee_disclosures_employee_id_employees_id_fk",
     "employee_disclosures", "employees", "employee_id", "id", "cascade"),
);

// ── 14. employee_disclosure_update_checks ─────────────────────────────────────
base.tables["public.employee_disclosure_update_checks"] = table(
  "employee_disclosure_update_checks",
  {
    id:            serial("id"),
    disclosure_id: int("disclosure_id",   { notNull: true }),
    checked_date:  datec("checked_date",   { notNull: true }),
    result:        text("result",          { notNull: true }),
    checked_by:    text("checked_by",      { notNull: true }),
    notes:         text("notes"),
    created_at:    ts("created_at"),
  },
  {},
  fk("employee_disclosure_update_checks_disclosure_id_employee_disclosures_id_fk",
     "employee_disclosure_update_checks", "employee_disclosures", "disclosure_id", "id", "cascade"),
);

// ── 15. employee_disclosure_reviews ───────────────────────────────────────────
base.tables["public.employee_disclosure_reviews"] = table(
  "employee_disclosure_reviews",
  {
    id:                    serial("id"),
    disclosure_id:         int("disclosure_id",         { notNull: true }),
    recommendation:        text("recommendation",        { notNull: true }),
    reviewer_notes:        text("reviewer_notes"),
    review_date:           datec("review_date",          { notNull: true }),
    signed_off_by_user_id: int("signed_off_by_user_id"),
    signed_off_at:         ts("signed_off_at", { notNull: false, default: undefined }),
    created_at:            ts("created_at"),
  },
  {},
  {
    ...fk("employee_disclosure_reviews_disclosure_id_employee_disclosures_id_fk",
          "employee_disclosure_reviews", "employee_disclosures", "disclosure_id",         "id", "cascade"),
    ...fk("employee_disclosure_reviews_signed_off_by_user_id_users_id_fk",
          "employee_disclosure_reviews", "users",                "signed_off_by_user_id", "id", "no action"),
  },
  { "employee_disclosure_reviews_disclosure_id_unique": { name: "employee_disclosure_reviews_disclosure_id_unique", nullsNotDistinct: false, columns: ["disclosure_id"] } },
);

// ── stamp new snapshot ────────────────────────────────────────────────────────
const newSnap = {
  ...base,
  id:     "00000000-0000-0000-0000-000000000003",
  prevId: "00000000-0000-0000-0000-000000000002",
};

const dest = `${metaDir}/0003_snapshot.json`;
await fs.writeFile(dest, JSON.stringify(newSnap, null, 2) + "\n");
console.log("✓ wrote", dest);
console.log("  tables:", Object.keys(newSnap.tables).length);
Object.keys(newSnap.tables).sort().forEach(t => console.log("  ", t));
