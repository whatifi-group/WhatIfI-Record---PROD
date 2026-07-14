import { Router, type IRouter } from "express";
import { and, eq, asc } from "drizzle-orm";
import {
  db,
  employeeQualificationsTable,
  qualificationTypesTable,
  qualificationRevalidationsTable,
  qualificationCertificatesTable,
} from "@workspace/db";
import { z } from "zod";

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
  fileUrl: z.string().url(),
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
      })
      .from(employeeQualificationsTable)
      .leftJoin(
        qualificationTypesTable,
        eq(
          employeeQualificationsTable.qualificationTypeId,
          qualificationTypesTable.id,
        ),
      )
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
      })
      .returning();

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
    const [created] = await db
      .insert(qualificationCertificatesTable)
      .values({
        qualificationId: params.data.qualId,
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl,
        mimeType: parsed.data.mimeType ?? null,
      })
      .returning();
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
    res.sendStatus(204);
  },
);

export default router;
