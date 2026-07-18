/**
 * Daily reminder digest — run via VPS cron (not by the app server).
 *
 * Finds:
 *   1. Employee qualifications expired or expiring within
 *      QUALIFICATION_REMINDER_WITHIN_DAYS days (default 30), verified only.
 *   2. Employees on the DBS/PVG Update Service (on_update_service = true)
 *      whose DBS issue-date anniversary falls within
 *      DBS_REMINDER_WITHIN_DAYS days (default 30). Employees on the Update
 *      Service don't need periodic manual re-checks tracked — just a
 *      reminder tied to the DBS date itself.
 *
 * Emails both lists as a single digest via the "expiry_reminder" template
 * (SysAdmin > Notifications). Exits cleanly either way so cron doesn't see a
 * hung process.
 */
import { and, eq, isNotNull, lte } from "drizzle-orm";
import {
  db,
  pool,
  employeeQualificationsTable,
  employeesTable,
  qualificationTypesTable,
  employeeDisclosuresTable,
} from "@workspace/db";
import {
  sendExpiryReminderDigest,
  type ExpiringQualificationReminder,
  type DbsAnniversaryReminder,
} from "../lib/email";

async function findExpiringQualifications(): Promise<ExpiringQualificationReminder[]> {
  const withinDays = Number(process.env.QUALIFICATION_REMINDER_WITHIN_DAYS ?? 30);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const rows = await db
    .select({
      employeeFirstName: employeesTable.firstName,
      employeeLastName: employeesTable.lastName,
      qualificationTypeName: qualificationTypesTable.name,
      expiryDate: employeeQualificationsTable.expiryDate,
    })
    .from(employeeQualificationsTable)
    .innerJoin(employeesTable, eq(employeeQualificationsTable.employeeId, employeesTable.id))
    .leftJoin(
      qualificationTypesTable,
      eq(employeeQualificationsTable.qualificationTypeId, qualificationTypesTable.id),
    )
    .where(
      and(
        isNotNull(employeeQualificationsTable.expiryDate),
        lte(employeeQualificationsTable.expiryDate, cutoffStr),
        eq(employeeQualificationsTable.verificationStatus, "verified"),
        eq(employeesTable.status, "active"),
      ),
    );

  const today = new Date().toISOString().split("T")[0];
  return rows.map((r) => ({
    employeeName: `${r.employeeFirstName} ${r.employeeLastName}`,
    qualificationTypeName: r.qualificationTypeName,
    expiryDate: r.expiryDate as string,
    daysUntilExpiry: Math.round(
      (new Date(r.expiryDate as string).getTime() - new Date(today).getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  }));
}

/** Next occurrence of issueDate's month/day on or after `from`. */
function nextAnniversary(issueDate: string, from: Date): Date {
  const issue = new Date(issueDate);
  const next = new Date(from.getFullYear(), issue.getMonth(), issue.getDate());
  if (next.getTime() < from.getTime()) {
    next.setFullYear(next.getFullYear() + 1);
  }
  return next;
}

async function findDbsAnniversaryReminders(): Promise<DbsAnniversaryReminder[]> {
  const withinDays = Number(process.env.DBS_REMINDER_WITHIN_DAYS ?? 30);

  const disclosures = await db
    .select({
      checkType: employeeDisclosuresTable.checkType,
      issueDate: employeeDisclosuresTable.issueDate,
      employeeFirstName: employeesTable.firstName,
      employeeLastName: employeesTable.lastName,
    })
    .from(employeeDisclosuresTable)
    .innerJoin(employeesTable, eq(employeeDisclosuresTable.employeeId, employeesTable.id))
    .where(
      and(
        eq(employeeDisclosuresTable.onUpdateService, true),
        eq(employeesTable.status, "active"),
      ),
    );

  const today = new Date();
  const results: DbsAnniversaryReminder[] = [];

  for (const d of disclosures) {
    const anniversary = nextAnniversary(d.issueDate, today);
    const daysUntil = Math.round(
      (anniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysUntil <= withinDays) {
      results.push({
        employeeName: `${d.employeeFirstName} ${d.employeeLastName}`,
        checkType: d.checkType,
        nextAnniversary: anniversary.toISOString().split("T")[0],
        daysUntilAnniversary: daysUntil,
      });
    }
  }

  return results;
}

async function main() {
  const [qualifications, dbsReminders] = await Promise.all([
    findExpiringQualifications(),
    findDbsAnniversaryReminders(),
  ]);

  console.log(
    `[reminders] ${qualifications.length} expiring qualification(s), ${dbsReminders.length} DBS anniversary reminder(s)`,
  );

  await sendExpiryReminderDigest(qualifications, dbsReminders);
}

main()
  .catch((err) => {
    console.error("[reminders] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
