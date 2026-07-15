import { Router, type IRouter } from "express";
import { and, eq, asc, lte, lt, isNotNull, sql, desc } from "drizzle-orm";
import {
  db,
  employeeQualificationsTable,
  qualificationTypesTable,
  qualificationRevalidationsTable,
  qualificationCertificatesTable,
  employeesTable,
  usersTable,
} from "@workspace/db";
import { requirePermission } from "../../middlewares/requirePermission";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "../../lib/objectStorage";
import { MAX_FILE_SIZE_BYTES, ALLOWED_CONTENT_TYPES } from "../../lib/uploadPolicy";
import { syncOnboardingSubmission } from "../../lib/onboardingSync";

export const objectStorageService = new ObjectStorageService();

const router: IRouter = Router({ mergeParams: true });

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const QualIdParam = z.object({
  id: z.coerce.number().int().positive(),
  qualId: z.coerce.number().int().positive(),
});
const CertIdParam = z.object({
  id: z.coerce.number().int().positive(),
  qualId: z.coerce.number().int().positive(),
  certId: z.coerce.number().int().positive(),
});

const QualificationInput = z.object({
  qualificationTypeId: z.number().int().positive(),
  dateAchieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional().nullable(),
});

const QualificationUpdate = z.object({
  qualificationTypeId: z.number().int().positive().optional(),
  dateAchieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional().nullable(),
});

const RevalidateInput = z.object({
  dateAchieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional().nullable(),
});

const CertificateInput = z.object({
  fileName: z.string().min(1),
  // Accept either a full https:// URL (legacy) or an internal object storage
  // path returned by the upload endpoint (e.g. "/objects/uploads/uuid").
  fileUrl: z.string().min(1).refine(
    (v) => v.startsWith("/objects/") || /^https?:\/\/.+/.test(v),
    { message: "fileUrl must be an absolute URL or an internal /objects/ path" },
  ),
  mimeType: z.string().optional().nullable(),
});

function calcExpiryDate(
  dateAchieved: string,
  validityValue: number,
  validityUnit: string,
): string {
  const d = new Date(dateAchieved + "T00:00:00Z");
  if (validityUnit === "days") d.setUTCDate(d.getUTCDate() + validityValue);
  else if (validityUnit === "months")
    d.setUTCMonth(d.getUTCMonth() + validityValue);
  else if (validityUnit === "years")
    d.setUTCFullYear(d.getUTCFullYear() + validityValue);
  return d.toISOString().split("T")[0];
}

// PATCH /employees/:id/qualifications/:qualId/verify  (HR Manager only)
const VerifyInput = z.object({
  status: z.enum(["verified", "rejected"]),
  notes: z.string().optional().nullable(),
});

router.patch(
  "/employees/:id/qualifications/:qualId/verify",
  requirePermission(["hr:access", "sysadmin"]),
  async (req, res): Promise<void> => {
    const params = QualIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = VerifyInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const [existing] = await db
      .select({ id: employeeQualificationsTable.id })
      .from(employeeQualificationsTable)
      .where(
        and(
          eq(employeeQualificationsTable.id, params.data.qualId),
          eq(employeeQualificationsTable.employeeId, params.data.id),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Qualification not found" });
      return;
    }

    const [updated] = await db
      .update(employeeQualificationsTable)
      .set({
        verificationStatus: parsed.data.status,
        verificationNotes: parsed.data.notes ?? null,
        verifiedBy: userId,
        verifiedAt: new Date(),
      })
      .where(eq(employeeQualificationsTable.id, params.data.qualId))
      .returning();

    // Join verifier name for response
    const [verifier] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const [qualType] = await db
      .select({ name: qualificationTypesTable.name, awardingBody: qualificationTypesTable.awardingBody })
      .from(qualificationTypesTable)
      .where(eq(qualificationTypesTable.id, updated.qualificationTypeId))
      .limit(1);

    res.json({
      ...updated,
      qualificationTypeName: qualType?.name ?? null,
      awardingBody: qualType?.awardingBody ?? null,
      verifiedByName: verifier?.name ?? null,
    });
  },
);

// GET /qualification-verifications  (HR Manager only)
const VerificationStatusParam = z.object({
  status: z.enum(["pending", "verified", "rejected"]).default("pending"),
});

router.get(
  "/qualification-verifications",
  requirePermission(["hr:access", "sysadmin"]),
  async (req, res): Promise<void> => {
    const parsed = VerificationStatusParam.safeParse(req.query);
    const status = parsed.success ? parsed.data.status : "pending";

    // Alias the users table for the verifier join to avoid conflict
    const verifierAlias = usersTable;

    const rows = await db
      .select({
        id: employeeQualificationsTable.id,
        employeeId: employeeQualificationsTable.employeeId,
        employeeFirstName: employeesTable.firstName,
        employeeLastName: employeesTable.lastName,
        qualificationTypeId: employeeQualificationsTable.qualificationTypeId,
        qualificationTypeName: qualificationTypesTable.name,
        awardingBody: qualificationTypesTable.awardingBody,
        dateAchieved: employeeQualificationsTable.dateAchieved,
        expiryDate: employeeQualificationsTable.expiryDate,
        notes: employeeQualificationsTable.notes,
        createdAt: employeeQualificationsTable.createdAt,
        verificationStatus: employeeQualificationsTable.verificationStatus,
        verificationNotes: employeeQualificationsTable.verificationNotes,
        verifiedBy: employeeQualificationsTable.verifiedBy,
        verifiedByName: verifierAlias.name,
        verifiedAt: employeeQualificationsTable.verifiedAt,
      })
      .from(employeeQualificationsTable)
      .innerJoin(employeesTable, eq(employeeQualificationsTable.employeeId, employeesTable.id))
      .leftJoin(qualificationTypesTable, eq(employeeQualificationsTable.qualificationTypeId, qualificationTypesTable.id))
      .leftJoin(verifierAlias, eq(employeeQualificationsTable.verifiedBy, verifierAlias.id))
      .where(eq(employeeQualificationsTable.verificationStatus, status))
      .orderBy(asc(employeeQualificationsTable.dateAchieved));

    // For pending items, also attach the most recent certificate URL
    const qualIds = rows.map((r) => r.id);
    const certMap = new Map<number, { fileUrl: string | null; fileName: string | null }>();
    if (qualIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      const certs = await db
        .select({
          qualificationId: qualificationCertificatesTable.qualificationId,
          fileUrl: qualificationCertificatesTable.fileUrl,
          fileName: qualificationCertificatesTable.fileName,
        })
        .from(qualificationCertificatesTable)
        .where(inArray(qualificationCertificatesTable.qualificationId, qualIds))
        .orderBy(desc(qualificationCertificatesTable.uploadedAt));
      for (const c of certs) {
        if (!certMap.has(c.qualificationId)) {
          certMap.set(c.qualificationId, { fileUrl: c.fileUrl, fileName: c.fileName });
        }
      }
    }

    res.json(
      rows.map((r) => ({
        ...r,
        certificateUrl: certMap.get(r.id)?.fileUrl ?? null,
        certificateFileName: certMap.get(r.id)?.fileName ?? null,
      })),
    );
  },
);

// GET /qualifications/expiring?withinDays=30
// Returns all qualification records with an expiry date that is expired or expiring soon.
// withinDays=0  → only already expired (expiryDate < today)
// withinDays=N  → expired OR expiring within N days (expiryDate <= today + N days)
router.get("/qualifications/expiring", async (req, res): Promise<void> => {
  const rawDays = parseInt(String(req.query.withinDays ?? ""), 10);
  const withinDays = Math.max(0, isNaN(rawDays) ? 30 : rawDays);
  const today = new Date().toISOString().split("T")[0];

  // Compute cutoff date string: today + withinDays days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const dateCondition =
    withinDays === 0
      ? lt(employeeQualificationsTable.expiryDate, today)
      : lte(employeeQualificationsTable.expiryDate, cutoffStr);

  const rows = await db
    .select({
      id: employeeQualificationsTable.id,
      employeeId: employeeQualificationsTable.employeeId,
      employeeFirstName: employeesTable.firstName,
      employeeLastName: employeesTable.lastName,
      qualificationTypeId: employeeQualificationsTable.qualificationTypeId,
      qualificationTypeName: qualificationTypesTable.name,
      awardingBody: qualificationTypesTable.awardingBody,
      dateAchieved: employeeQualificationsTable.dateAchieved,
      expiryDate: employeeQualificationsTable.expiryDate,
      notes: employeeQualificationsTable.notes,
      daysUntilExpiry: sql<number>`
        (${employeeQualificationsTable.expiryDate}::date - CURRENT_DATE)::integer
      `,
    })
    .from(employeeQualificationsTable)
    .innerJoin(employeesTable, eq(employeeQualificationsTable.employeeId, employeesTable.id))
    .leftJoin(qualificationTypesTable, eq(employeeQualificationsTable.qualificationTypeId, qualificationTypesTable.id))
    .where(
      and(
        isNotNull(employeeQualificationsTable.expiryDate),
        dateCondition,
        eq(employeeQualificationsTable.verificationStatus, "verified"),
      ),
    )
    .orderBy(asc(employeeQualificationsTable.expiryDate));

  res.json(rows);
});

// GET /employees/:id/qualifications
router.get(
  "/employees/:id/qualifications",
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await db
      .select({
        id: employeeQualificationsTable.id,
        employeeId: employeeQualificationsTable.employeeId,
        qualificationTypeId: employeeQualificationsTable.qualificationTypeId,
        dateAchieved: employeeQualificationsTable.dateAchieved,
        expiryDate: employeeQualificationsTable.expiryDate,
        notes: employeeQualificationsTable.notes,
        createdAt: employeeQualificationsTable.createdAt,
        qualificationTypeName: qualificationTypesTable.name,
        awardingBody: qualificationTypesTable.awardingBody,
        verificationStatus: employeeQualificationsTable.verificationStatus,
        verificationNotes: employeeQualificationsTable.verificationNotes,
        verifiedBy: employeeQualificationsTable.verifiedBy,
        verifiedByName: usersTable.name,
        verifiedAt: employeeQualificationsTable.verifiedAt,
      })
      .from(employeeQualificationsTable)
      .leftJoin(
        qualificationTypesTable,
        eq(
          employeeQualificationsTable.qualificationTypeId,
          qualificationTypesTable.id,
        ),
      )
      .leftJoin(usersTable, eq(employeeQualificationsTable.verifiedBy, usersTable.id))
      .where(eq(employeeQualificationsTable.employeeId, params.data.id))
      .orderBy(asc(employeeQualificationsTable.createdAt));
    res.json(rows);
  },
);

// POST /employees/:id/qualifications
router.post(
  "/employees/:id/qualifications",
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = QualificationInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [qualType] = await db
      .select()
      .from(qualificationTypesTable)
      .where(eq(qualificationTypesTable.id, parsed.data.qualificationTypeId))
      .limit(1);
    if (!qualType) {
      res.status(400).json({ error: "Qualification type not found" });
      return;
    }

    const expiryDate =
      qualType.validityValue && qualType.validityUnit
        ? calcExpiryDate(
            parsed.data.dateAchieved,
            qualType.validityValue,
            qualType.validityUnit,
          )
        : null;

    const [created] = await db
      .insert(employeeQualificationsTable)
      .values({
        employeeId: params.data.id,
        qualificationTypeId: parsed.data.qualificationTypeId,
        dateAchieved: parsed.data.dateAchieved,
        expiryDate,
        notes: parsed.data.notes ?? null,
        verificationStatus: "pending",
      })
      .returning();

    await syncOnboardingSubmission(params.data.id).catch((err) => {
      console.error("onboarding sync failed after qualification add:", err);
    });

    res.status(201).json({
      ...created,
      qualificationTypeName: qualType.name,
      awardingBody: qualType.awardingBody,
    });
  },
);

// PATCH /employees/:id/qualifications/:qualId
router.patch(
  "/employees/:id/qualifications/:qualId",
  async (req, res): Promise<void> => {
    const params = QualIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = QualificationUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(employeeQualificationsTable)
      .where(
        and(
          eq(employeeQualificationsTable.id, params.data.qualId),
          eq(employeeQualificationsTable.employeeId, params.data.id),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Qualification not found" });
      return;
    }

    const typeId = parsed.data.qualificationTypeId ?? existing.qualificationTypeId;
    const dateAchieved = parsed.data.dateAchieved ?? existing.dateAchieved;

    const [qualType] = await db
      .select()
      .from(qualificationTypesTable)
      .where(eq(qualificationTypesTable.id, typeId))
      .limit(1);
    if (!qualType) {
      res.status(400).json({ error: "Qualification type not found" });
      return;
    }

    const expiryDate =
      qualType.validityValue && qualType.validityUnit
        ? calcExpiryDate(dateAchieved, qualType.validityValue, qualType.validityUnit)
        : null;

    const [updated] = await db
      .update(employeeQualificationsTable)
      .set({
        ...(parsed.data.qualificationTypeId !== undefined && {
          qualificationTypeId: parsed.data.qualificationTypeId,
        }),
        ...(parsed.data.dateAchieved !== undefined && {
          dateAchieved: parsed.data.dateAchieved,
        }),
        expiryDate,
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      })
      .where(eq(employeeQualificationsTable.id, params.data.qualId))
      .returning();

    await syncOnboardingSubmission(params.data.id).catch((err) => {
      console.error("onboarding sync failed after qualification update:", err);
    });

    res.json({
      ...updated,
      qualificationTypeName: qualType.name,
      awardingBody: qualType.awardingBody,
    });
  },
);

// DELETE /employees/:id/qualifications/:qualId
router.delete(
  "/employees/:id/qualifications/:qualId",
  async (req, res): Promise<void> => {
    const params = QualIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // Fetch attached certificates before deleting so we can clean up GCS objects.
    const certs = await db
      .select({ id: qualificationCertificatesTable.id, fileUrl: qualificationCertificatesTable.fileUrl })
      .from(qualificationCertificatesTable)
      .where(eq(qualificationCertificatesTable.qualificationId, params.data.qualId));

    const [deleted] = await db
      .delete(employeeQualificationsTable)
      .where(
        and(
          eq(employeeQualificationsTable.id, params.data.qualId),
          eq(employeeQualificationsTable.employeeId, params.data.id),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Qualification not found" });
      return;
    }

    // Best-effort GCS cleanup for every certificate whose fileUrl is an internal
    // object path. Errors are swallowed so the main delete still succeeds even
    // when storage is temporarily unavailable.
    for (const cert of certs) {
      if (cert.fileUrl?.startsWith("/objects/")) {
        try {
          const file = await objectStorageService.getObjectEntityFile(cert.fileUrl);
          await file.delete();
        } catch (err) {
          if (!(err instanceof ObjectNotFoundError)) {
            console.error("Failed to delete certificate object during qualification cleanup:", err);
          }
        }
      }
    }

    await syncOnboardingSubmission(params.data.id).catch((err) => {
      console.error("onboarding sync failed after qualification delete:", err);
    });

    res.sendStatus(204);
  },
);

// POST /employees/:id/qualifications/:qualId/revalidate
router.post(
  "/employees/:id/qualifications/:qualId/revalidate",
  async (req, res): Promise<void> => {
    const params = QualIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = RevalidateInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(employeeQualificationsTable)
      .where(
        and(
          eq(employeeQualificationsTable.id, params.data.qualId),
          eq(employeeQualificationsTable.employeeId, params.data.id),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Qualification not found" });
      return;
    }

    const [qualType] = await db
      .select()
      .from(qualificationTypesTable)
      .where(eq(qualificationTypesTable.id, existing.qualificationTypeId))
      .limit(1);

    // Save old dates to revalidation history
    await db.insert(qualificationRevalidationsTable).values({
      qualificationId: existing.id,
      previousDateAchieved: existing.dateAchieved,
      previousExpiryDate: existing.expiryDate,
      notes: parsed.data.notes ?? null,
    });

    const expiryDate =
      qualType?.validityValue && qualType?.validityUnit
        ? calcExpiryDate(
            parsed.data.dateAchieved,
            qualType.validityValue,
            qualType.validityUnit,
          )
        : null;

    const [updated] = await db
      .update(employeeQualificationsTable)
      .set({
        dateAchieved: parsed.data.dateAchieved,
        expiryDate,
      })
      .where(eq(employeeQualificationsTable.id, params.data.qualId))
      .returning();

    await syncOnboardingSubmission(params.data.id).catch((err) => {
      console.error("onboarding sync failed after qualification revalidation:", err);
    });

    res.json({
      ...updated,
      qualificationTypeName: qualType?.name ?? null,
      awardingBody: qualType?.awardingBody ?? null,
    });
  },
);

/** Verify that qualId belongs to the given employeeId. Returns the row or null. */
async function requireQualOwnership(
  employeeId: number,
  qualId: number,
): Promise<{ id: number } | null> {
  const [row] = await db
    .select({ id: employeeQualificationsTable.id })
    .from(employeeQualificationsTable)
    .where(
      and(
        eq(employeeQualificationsTable.id, qualId),
        eq(employeeQualificationsTable.employeeId, employeeId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// GET /employees/:id/qualifications/:qualId/revalidations
router.get(
  "/employees/:id/qualifications/:qualId/revalidations",
  async (req, res): Promise<void> => {
    const params = QualIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const qual = await requireQualOwnership(params.data.id, params.data.qualId);
    if (!qual) {
      res.status(404).json({ error: "Qualification not found" });
      return;
    }
    const rows = await db
      .select()
      .from(qualificationRevalidationsTable)
      .where(eq(qualificationRevalidationsTable.qualificationId, params.data.qualId))
      .orderBy(asc(qualificationRevalidationsTable.revalidatedAt));
    res.json(rows);
  },
);

// GET /employees/:id/qualifications/:qualId/certificates
router.get(
  "/employees/:id/qualifications/:qualId/certificates",
  async (req, res): Promise<void> => {
    const params = QualIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const qual = await requireQualOwnership(params.data.id, params.data.qualId);
    if (!qual) {
      res.status(404).json({ error: "Qualification not found" });
      return;
    }
    const rows = await db
      .select()
      .from(qualificationCertificatesTable)
      .where(eq(qualificationCertificatesTable.qualificationId, params.data.qualId))
      .orderBy(asc(qualificationCertificatesTable.uploadedAt));
    res.json(rows);
  },
);

// POST /employees/:id/qualifications/:qualId/certificates
router.post(
  "/employees/:id/qualifications/:qualId/certificates",
  async (req, res): Promise<void> => {
    const params = QualIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const qual = await requireQualOwnership(params.data.id, params.data.qualId);
    if (!qual) {
      res.status(404).json({ error: "Qualification not found" });
      return;
    }
    const parsed = CertificateInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // For internally-stored objects verify the actual GCS metadata — size and
    // content-type — before persisting the record.  This prevents a client that
    // lied about those fields to obtain a presigned URL from bypassing the
    // upload policy.
    if (parsed.data.fileUrl.startsWith("/objects/")) {
      let objectMeta: { size: number; contentType: string };
      try {
        objectMeta = await objectStorageService.getObjectEntityMetadata(
          parsed.data.fileUrl,
        );
      } catch (err) {
        if (err instanceof ObjectNotFoundError) {
          res.status(400).json({ error: "The uploaded file could not be found in storage." });
        } else {
          console.error("Failed to read object metadata for certificate", err);
          res.status(500).json({ error: "Failed to verify uploaded file." });
        }
        return;
      }

      if (objectMeta.size > MAX_FILE_SIZE_BYTES) {
        // Delete the non-compliant object so it doesn't linger in storage.
        try {
          const file = await objectStorageService.getObjectEntityFile(parsed.data.fileUrl);
          await file.delete();
        } catch {
          // Best-effort cleanup — don't mask the real error.
        }
        res.status(400).json({
          error: `Uploaded file exceeds the 20 MB limit (${(objectMeta.size / 1024 / 1024).toFixed(1)} MB).`,
        });
        return;
      }

      if (!ALLOWED_CONTENT_TYPES.has(objectMeta.contentType)) {
        try {
          const file = await objectStorageService.getObjectEntityFile(parsed.data.fileUrl);
          await file.delete();
        } catch {
          // Best-effort cleanup.
        }
        res.status(400).json({
          error: `File type "${objectMeta.contentType}" is not allowed. Accepted types: PDF, PNG, JPEG, GIF, WEBP, HEIC.`,
        });
        return;
      }
    }

    const [created] = await db
      .insert(qualificationCertificatesTable)
      .values({
        qualificationId: params.data.qualId,
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl,
        mimeType: parsed.data.mimeType ?? null,
      })
      .returning();

    await syncOnboardingSubmission(params.data.id).catch((err) => {
      console.error("onboarding sync failed after certificate add:", err);
    });

    res.status(201).json(created);
  },
);

// DELETE /employees/:id/qualifications/:qualId/certificates/:certId
router.delete(
  "/employees/:id/qualifications/:qualId/certificates/:certId",
  async (req, res): Promise<void> => {
    const params = CertIdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Verify qualId belongs to this employee before touching any certificate
    const qual = await requireQualOwnership(params.data.id, params.data.qualId);
    if (!qual) {
      res.status(404).json({ error: "Qualification not found" });
      return;
    }
    const [deleted] = await db
      .delete(qualificationCertificatesTable)
      .where(
        and(
          eq(qualificationCertificatesTable.id, params.data.certId),
          eq(qualificationCertificatesTable.qualificationId, params.data.qualId),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Certificate not found" });
      return;
    }

    // Clean up the stored object when the fileUrl is an internal object path.
    // Legacy records with full https:// URLs are skipped — delete still succeeds.
    if (deleted.fileUrl?.startsWith("/objects/")) {
      try {
        const file = await objectStorageService.getObjectEntityFile(deleted.fileUrl);
        await file.delete();
      } catch (err) {
        if (!(err instanceof ObjectNotFoundError)) {
          console.error("Failed to delete certificate object from storage:", err);
        }
        // Either way, the DB row is already gone — respond 204.
      }
    }

    await syncOnboardingSubmission(params.data.id).catch((err) => {
      console.error("onboarding sync failed after certificate delete:", err);
    });

    res.sendStatus(204);
  },
);

export default router;
