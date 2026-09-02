/**
 * Idempotent notification-template seed — runs at server startup.
 * Inserts default rows for each known template key on first boot only;
 * never touches a row that already exists, so edits made from
 * SysAdmin > Notifications survive every restart and deploy.
 */
import { db, notificationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface SeedTemplate {
  key: string;
  label: string;
  description: string;
  /** Whether an admin can set a custom recipient list for this template. */
  recipientsEditable: boolean;
  subject: string;
  bodyText: string;
  placeholders: string[];
}

export const NOTIFICATION_TEMPLATES: SeedTemplate[] = [
  {
    key: "password_reset",
    label: "Password reset",
    description: "Sent to a user when they request a password reset. Recipient is always the requesting user — not configurable.",
    recipientsEditable: false,
    subject: "Reset your WhatIfI Record password",
    bodyText: [
      "Hi {{name}},",
      "",
      "You requested a password reset for your WhatIfI Record account.",
      "",
      "Reset link (valid for 1 hour): {{resetUrl}}",
      "",
      "If you did not request this, you can safely ignore this email.",
    ].join("\n"),
    placeholders: ["name", "resetUrl"],
  },
  {
    key: "onboarding_submitted",
    label: "Onboarding submitted",
    description: "Sent to HR when a new onboarding application is submitted.",
    recipientsEditable: true,
    subject: "New onboarding submission — {{applicantName}}",
    bodyText: [
      "{{applicantName}} has submitted an onboarding application.",
      "",
      "Review it here: {{reviewUrl}}",
    ].join("\n"),
    placeholders: ["applicantName", "reviewUrl"],
  },
  {
    key: "onboarding_approved",
    label: "Onboarding approved",
    description: "Sent to the applicant when HR approves their onboarding application. Recipient is always the new employee — not configurable.",
    recipientsEditable: false,
    subject: "Welcome to WhatIfI Group — your account is ready",
    bodyText: [
      "Hi {{name}},",
      "",
      "Your onboarding application has been approved. Your WhatIfI Record account is ready.",
      "",
      "Email: {{email}}",
      "",
      "Sign in with your Microsoft work account here: {{loginUrl}}",
    ].join("\n"),
    placeholders: ["name", "email", "loginUrl"],
  },
  {
    key: "onboarding_rejected",
    label: "Onboarding rejected",
    description: "Sent to the applicant when HR rejects their onboarding application. Recipient is always the applicant — not configurable.",
    recipientsEditable: false,
    subject: "Update on your WhatIfI Group application",
    bodyText: [
      "Hi {{name}},",
      "",
      "Thank you for your interest in joining WhatIfI Group and for completing the onboarding form.",
      "After review, we won't be proceeding with your application at this time.",
    ].join("\n"),
    placeholders: ["name"],
  },
  {
    key: "expiry_reminder",
    label: "Expiry reminder digest",
    description: "Daily digest (sent by the scheduled reminder job, if there's anything to report) listing qualifications and DBS/PVG checks coming due.",
    recipientsEditable: true,
    subject: "WhatIfI Record — {{itemCount}} item(s) need attention",
    bodyText: ["{{itemsList}}", "", "Review: {{reviewUrl}}"].join("\n"),
    placeholders: ["itemCount", "itemsList", "reviewUrl"],
  },
];

export async function seedNotificationSettings(): Promise<void> {
  for (const t of NOTIFICATION_TEMPLATES) {
    const [existing] = await db
      .select({ id: notificationSettingsTable.id })
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.key, t.key));

    if (!existing) {
      await db.insert(notificationSettingsTable).values({
        key: t.key,
        recipients: null,
        subject: t.subject,
        bodyText: t.bodyText,
      });
    }
  }
}
