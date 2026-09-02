/**
 * Email utility — sends transactional email via Brevo's HTTP API, using
 * templates stored in notification_settings (editable from
 * SysAdmin > Notifications; see lib/seedNotificationSettings.ts for defaults
 * and lib/db/schema/sysadmin/notificationSettings.ts for the table).
 *
 * Configure via environment variables:
 *   BREVO_API_KEY       Brevo transactional-email API key
 *   BREVO_SENDER_EMAIL  Verified sender address
 *   BREVO_SENDER_NAME   Display name (defaults to "WhatIfI Record")
 *   APP_URL             Base URL used to build links and the logo image src
 *                        (defaults to https://record.whatifigroup.co.uk)
 *
 * When BREVO_API_KEY is not set, sendEmail() logs and returns instead of
 * sending — callers treat email as best-effort and must not fail the request
 * that triggered it just because a message couldn't go out.
 */
import { eq } from "drizzle-orm";
import { db, notificationSettingsTable } from "@workspace/db";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

function senderEmail(): string {
  return process.env.BREVO_SENDER_EMAIL ?? "noreply@whatifigroup.co.uk";
}

function senderName(): string {
  return process.env.BREVO_SENDER_NAME ?? "WhatIfI Record";
}

function appUrl(): string {
  return (
    process.env.APP_URL?.replace(/\/$/, "") ?? "https://record.whatifigroup.co.uk"
  );
}

// ── Template loading + rendering ─────────────────────────────────────────────

interface Template {
  recipients: string | null;
  subject: string;
  bodyText: string;
}

async function getTemplate(key: string): Promise<Template | null> {
  const [row] = await db
    .select({
      recipients: notificationSettingsTable.recipients,
      subject: notificationSettingsTable.subject,
      bodyText: notificationSettingsTable.bodyText,
    })
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.key, key))
    .limit(1);
  return row ?? null;
}

function render(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match,
  );
}

function parseRecipients(recipients: string | null): string[] {
  return (recipients ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

// ── Branded HTML wrapper ─────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text (post-placeholder-substitution) → paragraphs, with bare URLs linked. */
function textToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((para) => {
      const escaped = escapeHtml(para).replace(/\n/g, "<br>");
      const linked = escaped.replace(
        /(https?:\/\/[^\s<]+)/g,
        (url) => `<a href="${url}" style="color:#0b1b3d;font-weight:600">${url}</a>`,
      );
      return `<p style="margin:0 0 16px">${linked}</p>`;
    })
    .join("\n");
}

function emailShell(bodyHtml: string): string {
  const logoUrl = `${appUrl()}/branding/logo.png`;
  return `
    <div style="background:#f1f5f9;padding:32px 16px;font-family:sans-serif">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="padding:24px 24px 16px;text-align:center;border-bottom:3px solid #0b1b3d">
          <img src="${logoUrl}" alt="WhatIfI Group" style="width:120px;height:auto" />
        </div>
        <div style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6">
          ${bodyHtml}
        </div>
        <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;text-align:center">
          WhatIfI Group · One Question, Many Paths, Lasting Impact
        </div>
      </div>
    </div>`;
}

function buttonHtml(href: string, label: string): string {
  return `
    <p style="margin:24px 0">
      <a href="${href}"
         style="background:#0b1b3d;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
        ${label}
      </a>
    </p>`;
}

// ── Brevo send ────────────────────────────────────────────────────────────────

interface SendEmailInput {
  to: { email: string; name?: string }[];
  subject: string;
  html: string;
  text: string;
}

/**
 * Send a transactional email via Brevo. Never throws — logs and returns on
 * missing config or a failed API call, since a broken email send must not
 * block the onboarding/auth flow that triggered it.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn(
      `[email] BREVO_API_KEY not configured — skipping "${subject}" to ${to.map((r) => r.email).join(", ")}`,
    );
    return;
  }

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: senderEmail(), name: senderName() },
        to,
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Brevo send failed (${res.status}) for "${subject}": ${body}`);
    }
  } catch (err) {
    console.error(`[email] Brevo request threw for "${subject}":`, err);
  }
}

/** Render a template (subject + body) with vars and send it, wrapped in the branded shell. */
async function sendTemplatedEmail(
  key: string,
  to: { email: string; name?: string }[],
  vars: Record<string, string>,
  ctaHref?: string,
  ctaLabel?: string,
): Promise<void> {
  const template = await getTemplate(key);
  if (!template) {
    console.error(`[email] No notification_settings row for key "${key}" — cannot send`);
    return;
  }

  const subject = render(template.subject, vars);
  const bodyText = render(template.bodyText, vars);
  const bodyHtml = textToHtml(bodyText) + (ctaHref && ctaLabel ? buttonHtml(ctaHref, ctaLabel) : "");

  await sendEmail({
    to,
    subject,
    text: bodyText,
    html: emailShell(bodyHtml),
  });
}

// ── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string,
): Promise<void> {
  await sendTemplatedEmail(
    "password_reset",
    [{ email: to, name }],
    { name, resetUrl },
    resetUrl,
    "Reset password",
  );
}

// ── Onboarding: application submitted (notify HR) ───────────────────────────

export async function sendOnboardingSubmittedEmail(applicantName: string): Promise<void> {
  const template = await getTemplate("onboarding_submitted");
  const recipients = parseRecipients(template?.recipients ?? null);
  if (recipients.length === 0) {
    console.warn("[email] onboarding_submitted has no recipients configured — skipping. Set this in SysAdmin > Notifications.");
    return;
  }

  const reviewUrl = `${appUrl()}/onboarding-queue`;
  await sendTemplatedEmail(
    "onboarding_submitted",
    recipients.map((email) => ({ email })),
    { applicantName, reviewUrl },
    reviewUrl,
    "Review submission",
  );
}

// ── Onboarding: approved (welcome) ───────────────────────────────────────────

export async function sendOnboardingApprovedEmail(
  to: string,
  name: string,
): Promise<void> {
  const loginUrl = `${appUrl()}/login`;
  await sendTemplatedEmail(
    "onboarding_approved",
    [{ email: to, name }],
    { name, email: to, loginUrl },
    loginUrl,
    "Log in",
  );
}

// ── Onboarding: rejected ──────────────────────────────────────────────────────

export async function sendOnboardingRejectedEmail(to: string, name: string): Promise<void> {
  await sendTemplatedEmail("onboarding_rejected", [{ email: to, name }], { name });
}

// ── Qualification / DBS expiry reminders ──────────────────────────────────────

export interface ExpiringQualificationReminder {
  employeeName: string;
  qualificationTypeName: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
}

export interface DbsAnniversaryReminder {
  employeeName: string;
  checkType: string;
  nextAnniversary: string;
  daysUntilAnniversary: number;
}

/**
 * Daily-digest reminder sent to the recipients configured for
 * "expiry_reminder". Used by scripts/sendExpiryReminders.ts (run via cron),
 * not triggered from a request.
 */
export async function sendExpiryReminderDigest(
  qualifications: ExpiringQualificationReminder[],
  dbsReminders: DbsAnniversaryReminder[],
): Promise<void> {
  if (qualifications.length === 0 && dbsReminders.length === 0) return;

  const template = await getTemplate("expiry_reminder");
  const recipients = parseRecipients(template?.recipients ?? null);
  if (recipients.length === 0) {
    console.warn("[email] expiry_reminder has no recipients configured — skipping. Set this in SysAdmin > Notifications.");
    return;
  }

  const qualLines = qualifications.map(
    (q) =>
      `- ${q.employeeName} — ${q.qualificationTypeName ?? "Unknown qualification"} ` +
      (q.daysUntilExpiry < 0
        ? `expired ${Math.abs(q.daysUntilExpiry)} day(s) ago (${q.expiryDate})`
        : `expires in ${q.daysUntilExpiry} day(s) (${q.expiryDate})`),
  );
  const dbsLines = dbsReminders.map(
    (d) =>
      `- ${d.employeeName} — ${d.checkType.toUpperCase()} Update Service reminder: ` +
      `anniversary ${d.nextAnniversary} (in ${d.daysUntilAnniversary} day(s))`,
  );

  const itemsList = [
    qualifications.length > 0 ? "Expiring / expired qualifications:" : null,
    ...qualLines,
    qualifications.length > 0 && dbsReminders.length > 0 ? "" : null,
    dbsReminders.length > 0 ? "DBS/PVG Update Service reminders:" : null,
    ...dbsLines,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const reviewUrl = `${appUrl()}/expiring-qualifications`;
  await sendTemplatedEmail(
    "expiry_reminder",
    recipients.map((email) => ({ email })),
    {
      itemCount: String(qualifications.length + dbsReminders.length),
      itemsList,
      reviewUrl,
    },
    reviewUrl,
    "Review",
  );
}
