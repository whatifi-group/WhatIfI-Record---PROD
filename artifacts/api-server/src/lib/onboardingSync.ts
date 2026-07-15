/**
 * Onboarding sync helper.
 *
 * After any HR write that touches an employee's profile or qualifications,
 * call syncOnboardingSubmission(employeeId, db) to keep the linked
 * onboarding submission current.
 *
 * Logic:
 *  1. Find any approved/rejected onboarding_submissions row linked to employeeId.
 *  2. Overwrite profile fields on the submission from the live employee record.
 *  3. Replace all onboarding_submission_qualifications for that submission with
 *     the employee's live qualifications.  Each qualification row is preserved
 *     individually (keyed by qualification ID, not type), and each carries the
 *     most recently uploaded certificate (ordered by uploadedAt DESC).
 *
 * No-op if no linked submission exists.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db as defaultDb,
  onboardingSubmissionsTable,
  onboardingSubmissionQualificationsTable,
  employeesTable,
  employeeQualificationsTable,
  qualificationCertificatesTable,
} from "@workspace/db";

type DbOrTx = Omit<typeof defaultDb, "$client">;

export async function syncOnboardingSubmission(
  employeeId: number,
  db: DbOrTx = defaultDb,
): Promise<void> {
  // 1. Find a linked approved or rejected submission
  const [submission] = await db
    .select({ id: onboardingSubmissionsTable.id })
    .from(onboardingSubmissionsTable)
    .where(
      and(
        eq(onboardingSubmissionsTable.employeeId, employeeId),
        inArray(onboardingSubmissionsTable.onboardingStatus, [
          "approved",
          "rejected",
        ]),
      ),
    )
    .limit(1);

  if (!submission) {
    // No linked submission — nothing to sync.
    return;
  }

  // 2. Read the current employee record
  const [employee] = await db
    .select({
      firstName: employeesTable.firstName,
      lastName: employeesTable.lastName,
      email: employeesTable.email,
      jobTitle: employeesTable.jobTitle,
      departmentId: employeesTable.departmentId,
      employmentType: employeesTable.employmentType,
      startDate: employeesTable.startDate,
    })
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId))
    .limit(1);

  if (!employee) return;

  // 3. Overwrite profile fields on the submission
  await db
    .update(onboardingSubmissionsTable)
    .set({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      jobTitle: employee.jobTitle,
      departmentId: employee.departmentId,
      employmentType: employee.employmentType,
      startDate: employee.startDate,
      updatedAt: new Date(),
    })
    .where(eq(onboardingSubmissionsTable.id, submission.id));

  // 4. Read all live qualifications for this employee
  const liveQuals = await db
    .select({
      id: employeeQualificationsTable.id,
      qualificationTypeId: employeeQualificationsTable.qualificationTypeId,
      dateAchieved: employeeQualificationsTable.dateAchieved,
      expiryDate: employeeQualificationsTable.expiryDate,
      notes: employeeQualificationsTable.notes,
      verificationStatus: employeeQualificationsTable.verificationStatus,
    })
    .from(employeeQualificationsTable)
    .where(eq(employeeQualificationsTable.employeeId, employeeId));

  // 5. For each qualification, fetch the most recently uploaded certificate
  //    (deterministic: ordered by uploadedAt DESC, limit 1 per qual).
  const certsByQualId = new Map<
    number,
    { fileName: string | null; fileUrl: string | null; mimeType: string | null }
  >();

  if (liveQuals.length > 0) {
    const qualIds = liveQuals.map((q) => q.id);
    // Fetch all certs for these quals, ordered newest-first.
    const allCerts = await db
      .select({
        qualificationId: qualificationCertificatesTable.qualificationId,
        fileName: qualificationCertificatesTable.fileName,
        fileUrl: qualificationCertificatesTable.fileUrl,
        mimeType: qualificationCertificatesTable.mimeType,
        uploadedAt: qualificationCertificatesTable.uploadedAt,
      })
      .from(qualificationCertificatesTable)
      .where(inArray(qualificationCertificatesTable.qualificationId, qualIds))
      .orderBy(desc(qualificationCertificatesTable.uploadedAt));

    // Keep only the first (latest) cert seen per qual ID
    for (const cert of allCerts) {
      if (!certsByQualId.has(cert.qualificationId)) {
        certsByQualId.set(cert.qualificationId, {
          fileName: cert.fileName,
          fileUrl: cert.fileUrl,
          mimeType: cert.mimeType,
        });
      }
    }
  }

  // 6. Replace submission qualifications — delete then re-insert
  await db
    .delete(onboardingSubmissionQualificationsTable)
    .where(
      eq(onboardingSubmissionQualificationsTable.submissionId, submission.id),
    );

  if (liveQuals.length > 0) {
    await db.insert(onboardingSubmissionQualificationsTable).values(
      liveQuals.map((q) => {
        const cert = certsByQualId.get(q.id);
        return {
          submissionId: submission.id,
          qualificationTypeId: q.qualificationTypeId,
          dateAchieved: q.dateAchieved,
          expiryDate: q.expiryDate,
          notes: q.notes,
          fileName: cert?.fileName ?? null,
          fileUrl: cert?.fileUrl ?? null,
          mimeType: cert?.mimeType ?? null,
        };
      }),
    );
  }
}
