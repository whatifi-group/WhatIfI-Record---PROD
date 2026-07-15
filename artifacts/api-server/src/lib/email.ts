/**
 * Email utility — sends transactional email via SMTP.
 *
 * Configure via environment variables:
 *   SMTP_HOST     e.g. smtp.resend.com
 *   SMTP_PORT     e.g. 465 (SSL) or 587 (STARTTLS)
 *   SMTP_SECURE   "true" for SSL/port 465, omit for STARTTLS
 *   SMTP_USER     e.g. resend (or full email for other providers)
 *   SMTP_PASS     SMTP password / API key
 *   SMTP_FROM     e.g. "WhatIfI Record <noreply@whatifigroup.co.uk>"
 *
 * When SMTP_HOST is not set the reset URL is logged to the console so an
 * admin can share it manually.
 */
import nodemailer from "nodemailer";

function createTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string,
): Promise<void> {
  const from =
    process.env.SMTP_FROM ?? "WhatIfI Record <noreply@whatifigroup.co.uk>";

  const transport = createTransport();
  if (!transport) {
    console.warn(
      `[email] SMTP not configured — password reset URL for ${to}:\n${resetUrl}`,
    );
    return;
  }

  await transport.sendMail({
    from,
    to,
    subject: "Reset your WhatIfI Record password",
    text: [
      `Hi ${name},`,
      "",
      "You requested a password reset for your WhatIfI Record account.",
      "",
      `Reset link (valid for 1 hour):`,
      resetUrl,
      "",
      "If you did not request this, you can safely ignore this email.",
      "",
      "— WhatIfI Record",
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0f172a">Reset your password</h2>
        <p>Hi ${name},</p>
        <p>You requested a password reset for your <strong>WhatIfI Record</strong> account.</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}"
             style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
            Reset password
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">This link expires in 1 hour. If you did not request this, ignore this email.</p>
      </div>`,
  });
}
