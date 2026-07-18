import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Configurable transactional email templates, editable from
 * SysAdmin > Notifications. One row per email "key" (see
 * lib/email.ts NOTIFICATION_KEYS) — seeded with defaults at server startup,
 * never overwritten once a row exists (see lib/seedNotificationSettings.ts).
 *
 * `recipients` is null for templates whose recipient is determined by
 * business logic (e.g. password reset always goes to the requesting user;
 * onboarding approved/rejected always goes to the applicant) — only the HR
 * notification templates (submitted, expiry reminder) have an editable
 * recipient list.
 */
export const notificationSettingsTable = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  recipients: text("recipients"),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertNotificationSettingSchema = createInsertSchema(
  notificationSettingsTable,
).omit({ id: true, updatedAt: true });

export type InsertNotificationSetting = z.infer<
  typeof insertNotificationSettingSchema
>;
export type NotificationSettingRow =
  typeof notificationSettingsTable.$inferSelect;
