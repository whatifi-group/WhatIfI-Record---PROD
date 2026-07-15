/**
 * Onboarding routes — self-service new-hire flow.
 *
 * Public (no session required):
 *   POST /api/onboarding/verify  — validate shared password → return JWT
 *   POST /api/onboarding/submit  — JWT-gated; submit onboarding form
 *
 * HR/SysAdmin only:
 *   GET  /api/onboarding/submissions          — paginated list
 *   GET  /api/onboarding/submissions/:id      — full detail
 *   POST /api/onboarding/submissions/:id/approve
 *   POST /api/onboarding/submissions/:id/reject
 */
import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  lovItemsTable,
  onboardingSubmissionsTable,
  onboardingSubmissionQualificationsTable,
  employeesTable,
  employeeQualificationsTable,
  qualificationTypesTable,
  qualificationCertificatesTable,
  usersTable,
  rolesTable,
  employeeServicePeriodsTable,
} from "@workspace/db";
import { requirePermission } from "../middlewares/requirePermission";
import { requireOnboardingSession } from "../middlewares/requireOnboardingSession";
import { signOnboardingToken } from "../lib/onboardingJwt";
import { hashPassword } from "../lib/password";
import crypto from "node:crypto";

const router: IRouter = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const VerifyBody = z.object({
  password: z.string().min(1),
});

const SubmissionQualificationInput = z.object({
  qualificationTypeId: z.number().int().positive(),
  dateAchieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  notes: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
});

const SubmitBody = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  jobTitle: z.string().min(1).max(200),
  departmentId: z.number().int().positive().optional().nullable(),
  employmentType: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  qualifications: z.array(SubmissionQualificationInput).optional().default([]),
});

const SubmissionsQuery = z.object({
  status: z
    .enum(["pending", "approved", "rejected"])
    .optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const ApproveBody = z.object({
  userRole: z.number().int().positive().optional(), // defaults to employee_self_service role
  reviewNotes: z.string().optional().nullable(),
});

const RejectBody = z.object({
  leaverReason: z.string().min(1),
  reviewNotes: z.string().optional().nullable(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch the onboarding passphrase (stored in the label field). */
async function getOnboardingPassphrase(): Promise<string | null> {
  const [row] = await db
    .select({ label: lovItemsTable.label })
    .from(lovItemsTable)
    .where(
      and(
        eq(lovItemsTable.category, "system_config"),
        eq(lovItemsTable.value, "onboarding_password"),
        eq(lovItemsTable.isActive, true),
      ),
    )
    .limit(1);
  // "Onboarding Password" is the default seed label — treat that as "not set"
  if (!row || row.label === "Onboarding Password") return null;
  return row.label;
}

/** Generate a random temporary password (12 chars, alphanumeric + special). */
function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

// Drizzle transactions satisfy the same query interface as db but lack $client.
type DbOrTx = Omit<typeof db, "$client">;

/** Copy qualifications from a submission into employee_qualifications. */
async function copySubmissionQualifications(
  tx: DbOrTx,
  submissionId: number,
  employeeId: number,
): Promise<void> {
  const quals = await tx
    .select()
    .from(onboardingSubmissionQualificationsTable)
    .where(
      eq(onboardingSubmissionQualificationsTable.submissionId, submissionId),
    );

  for (const qual of quals) {
    const [inserted] = await tx
      .insert(employeeQualificationsTable)
      .values({
        employeeId,
        qualificationTypeId: qual.qualificationTypeId,
        dateAchieved: qual.dateAchieved,
        expiryDate: qual.expiryDate,
        notes: qual.notes,
      })
      .returning();

    if (qual.fileUrl && inserted) {
      await tx.insert(qualificationCertificatesTable).values({
        qualificationId: inserted.id,
        fileName: qual.fileName ?? "certificate",
        fileUrl: qual.fileUrl,
        mimeType: qual.mimeType,
      });
    }
  }
}

// ── POST /api/onboarding/verify ───────────────────────────────────────────────

router.post("/onboarding/verify", async (req, res): Promise<void> => {
  const parsed = VerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const passphrase = await getOnboardingPassphrase();
  if (!passphrase) {
    res.status(503).json({
      error:
        "Onboarding is not currently open. Please contact HR for access.",
    });
    return;
  }

  // Constant-time comparison to resist timing attacks
  const provided = Buffer.from(parsed.data.password);
  const stored = Buffer.from(passphrase);
  const match =
    provided.length === stored.length &&
    crypto.timingSafeEqual(provided, stored);

  if (!match) {
    res.status(401).json({ error: "Incorrect onboarding password" });
    return;
  }

  const token = signOnboardingToken();
  res.json({ token });
});

// ── POST /api/onboarding/submit ───────────────────────────────────────────────

router.post(
  "/onboarding/submit",
  requireOnboardingSession,
  async (req, res): Promise<void> => {
    const parsed = SubmitBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { qualifications, ...profileData } = parsed.data;

    const [submission] = await db
      .insert(onboardingSubmissionsTable)
      .values({
        ...profileData,
        email: profileData.email.toLowerCase(),
        onboardingStatus: "pending",
      })
      .returning();

    if (qualifications.length > 0) {
      await db.insert(onboardingSubmissionQualificationsTable).values(
        qualifications.map((q) => ({
          submissionId: submission.id,
          qualificationTypeId: q.qualificationTypeId,
          dateAchieved: q.dateAchieved,
          expiryDate: q.expiryDate ?? null,
          notes: q.notes ?? null,
          fileName: q.fileName ?? null,
          fileUrl: q.fileUrl ?? null,
          mimeType: q.mimeType ?? null,
        })),
      );
    }

    res.status(201).json({ id: submission.id, status: submission.onboardingStatus });
  },
);

// ── GET /api/onboarding/submissions ──────────────────────────────────────────

router.get(
  "/onboarding/submissions",
  requirePermission(["hr:access", "sysadmin"]),
  async (req, res): Promise<void> => {
    const query = SubmissionsQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }

    const { status, page, pageSize } = query.data;
    const offset = (page - 1) * pageSize;

    const conditions = status
      ? [eq(onboardingSubmissionsTable.onboardingStatus, status)]
      : [];

    const rows = await db
      .select({
        id: onboardingSubmissionsTable.id,
        firstName: onboardingSubmissionsTable.firstName,
        lastName: onboardingSubmissionsTable.lastName,
        email: onboardingSubmissionsTable.email,
        jobTitle: onboardingSubmissionsTable.jobTitle,
        employmentType: onboardingSubmissionsTable.employmentType,
        startDate: onboardingSubmissionsTable.startDate,
        onboardingStatus: onboardingSubmissionsTable.onboardingStatus,
        employeeId: onboardingSubmissionsTable.employeeId,
        submittedAt: onboardingSubmissionsTable.submittedAt,
        reviewedAt: onboardingSubmissionsTable.reviewedAt,
      })
      .from(onboardingSubmissionsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(onboardingSubmissionsTable.submittedAt))
      .limit(pageSize)
      .offset(offset);

    res.json({ data: rows, page, pageSize });
  },
);

// ── GET /api/onboarding/submissions/:id ──────────────────────────────────────

router.get(
  "/onboarding/submissions/:id",
  requirePermission(["hr:access", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [submission] = await db
      .select()
      .from(onboardingSubmissionsTable)
      .where(eq(onboardingSubmissionsTable.id, params.data.id))
      .limit(1);

    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    const qualifications = await db
      .select({
        id: onboardingSubmissionQualificationsTable.id,
        qualificationTypeId:
          onboardingSubmissionQualificationsTable.qualificationTypeId,
        qualificationTypeName: qualificationTypesTable.name,
        dateAchieved: onboardingSubmissionQualificationsTable.dateAchieved,
        expiryDate: onboardingSubmissionQualificationsTable.expiryDate,
        notes: onboardingSubmissionQualificationsTable.notes,
        fileName: onboardingSubmissionQualificationsTable.fileName,
        fileUrl: onboardingSubmissionQualificationsTable.fileUrl,
        mimeType: onboardingSubmissionQualificationsTable.mimeType,
      })
      .from(onboardingSubmissionQualificationsTable)
      .leftJoin(
        qualificationTypesTable,
        eq(
          onboardingSubmissionQualificationsTable.qualificationTypeId,
          qualificationTypesTable.id,
        ),
      )
      .where(
        eq(
          onboardingSubmissionQualificationsTable.submissionId,
          params.data.id,
        ),
      );

    res.json({ ...submission, qualifications });
  },
);

// ── POST /api/onboarding/submissions/:id/approve ─────────────────────────────

router.post(
  "/onboarding/submissions/:id/approve",
  requirePermission(["hr:access", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = ApproveBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    // Resolve the role to assign — default to employee_self_service system role
    let roleId = body.data.userRole;
    if (!roleId) {
      const [selfServiceRole] = await db
        .select({ id: rolesTable.id })
        .from(rolesTable)
        .where(eq(rolesTable.name, "Employee Self-Service"))
        .limit(1);
      if (!selfServiceRole) {
        res.status(500).json({ error: "Employee Self-Service role not found — run seed first" });
        return;
      }
      roleId = selfServiceRole.id;
    }

    const tempPassword = generateTempPassword();
    const today = new Date().toISOString().slice(0, 10);
    const reviewerId = (req as any).session?.userId ?? null;

    const result = await db.transaction(async (tx) => {
      // Atomically claim the submission by transitioning pending → approved.
      // The conditional WHERE ensures only one concurrent request succeeds;
      // any other concurrent approve/reject call will get 0 rows back.
      const [submission] = await tx
        .update(onboardingSubmissionsTable)
        .set({
          onboardingStatus: "approved",
          reviewedAt: new Date(),
          reviewedByUserId: reviewerId,
          reviewNotes: body.data.reviewNotes ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(onboardingSubmissionsTable.id, params.data.id),
            eq(onboardingSubmissionsTable.onboardingStatus, "pending"),
          ),
        )
        .returning();

      if (!submission) {
        // Either not found or already processed — we'll distinguish below.
        return null;
      }

      // 1. Insert active employee
      const [employee] = await tx
        .insert(employeesTable)
        .values({
          firstName: submission.firstName,
          lastName: submission.lastName,
          email: submission.email,
          phone: submission.phone,
          jobTitle: submission.jobTitle,
          departmentId: submission.departmentId,
          employmentType: submission.employmentType,
          startDate: submission.startDate,
          status: "active",
        })
        .returning();

      // Open initial service period
      await tx.insert(employeeServicePeriodsTable).values({
        employeeId: employee.id,
        startDate: submission.startDate ?? today,
      });

      // 2. Insert linked user account with temporary password
      await tx.insert(usersTable).values({
        name: `${submission.firstName} ${submission.lastName}`,
        email: submission.email,
        passwordHash: hashPassword(tempPassword),
        status: "active",
        roleId: roleId!,
        permissions: [],
        isSystemAccount: false,
        employeeId: employee.id,
      });

      // 3. Copy qualifications from submission
      await copySubmissionQualifications(tx, submission.id, employee.id);

      // 4. Set employeeId FK back on the submission row
      await tx
        .update(onboardingSubmissionsTable)
        .set({ employeeId: employee.id, updatedAt: new Date() })
        .where(eq(onboardingSubmissionsTable.id, submission.id));

      return { employeeId: employee.id };
    });

    if (result === null) {
      // Check whether submission exists to return the right status code
      const [existing] = await db
        .select({ id: onboardingSubmissionsTable.id, onboardingStatus: onboardingSubmissionsTable.onboardingStatus })
        .from(onboardingSubmissionsTable)
        .where(eq(onboardingSubmissionsTable.id, params.data.id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "Submission not found" });
      } else {
        res.status(409).json({ error: `Submission is already ${existing.onboardingStatus}` });
      }
      return;
    }

    res.status(201).json({
      employeeId: result.employeeId,
      temporaryPassword: tempPassword,
    });
  },
);

// ── POST /api/onboarding/submissions/:id/reject ───────────────────────────────

router.post(
  "/onboarding/submissions/:id/reject",
  requirePermission(["hr:access", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = RejectBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const reviewerId = (req as any).session?.userId ?? null;

    const result = await db.transaction(async (tx) => {
      // Atomically claim the submission by transitioning pending → rejected.
      const [submission] = await tx
        .update(onboardingSubmissionsTable)
        .set({
          onboardingStatus: "rejected",
          reviewedAt: new Date(),
          reviewedByUserId: reviewerId,
          reviewNotes: body.data.reviewNotes ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(onboardingSubmissionsTable.id, params.data.id),
            eq(onboardingSubmissionsTable.onboardingStatus, "pending"),
          ),
        )
        .returning();

      if (!submission) {
        return null;
      }

      // 1. Insert employee with status = leaver (audit record)
      const [employee] = await tx
        .insert(employeesTable)
        .values({
          firstName: submission.firstName,
          lastName: submission.lastName,
          email: submission.email,
          phone: submission.phone,
          jobTitle: submission.jobTitle,
          departmentId: submission.departmentId,
          employmentType: submission.employmentType,
          startDate: submission.startDate ?? today,
          status: "leaver",
          leaverReason: body.data.leaverReason,
          leaverDate: today,
        })
        .returning();

      // 2. Copy qualifications from submission
      await copySubmissionQualifications(tx, submission.id, employee.id);

      // 3. Set employeeId FK back on the submission row
      await tx
        .update(onboardingSubmissionsTable)
        .set({ employeeId: employee.id, updatedAt: new Date() })
        .where(eq(onboardingSubmissionsTable.id, submission.id));

      return { employeeId: employee.id };
    });

    if (result === null) {
      const [existing] = await db
        .select({ id: onboardingSubmissionsTable.id, onboardingStatus: onboardingSubmissionsTable.onboardingStatus })
        .from(onboardingSubmissionsTable)
        .where(eq(onboardingSubmissionsTable.id, params.data.id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "Submission not found" });
      } else {
        res.status(409).json({ error: `Submission is already ${existing.onboardingStatus}` });
      }
      return;
    }

    res.json({ employeeId: result.employeeId });
  },
);

export default router;
