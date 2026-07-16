/**
 * Self-service data routes — employees reading their own HR record.
 *
 * GET /api/self-service/my-record
 *   Returns the authenticated employee's own address, next of kin (with phones),
 *   medical/dietary selections, disclosures, and Update Service consent records
 *   (with short-lived signed PDF download URLs).
 *   Requires: view_own_profile permission + a linked employeeId on the user.
 */
import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  employeeAddressesTable,
  employeeNextOfKinTable,
  employeeNextOfKinPhonesTable,
  employeeMedicalSelectionsTable,
  employeeMedicalNotesTable,
  employeeDietarySelectionsTable,
  employeeDietaryNotesTable,
  employeeDisclosuresTable,
  employeeDisclosureConsentsTable,
  employeeAttachmentsTable,
} from "@workspace/db";
import { requirePermission } from "../middlewares/requirePermission";
import { objectStorageService } from "./storage";

const router: IRouter = Router();

// ── GET /api/self-service/my-record ──────────────────────────────────────────
router.get(
  "/self-service/my-record",
  requirePermission(["view_own_profile"]),
  async (req, res): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    // Resolve the employee linked to this user account
    const [user] = await db
      .select({ employeeId: usersTable.employeeId })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user?.employeeId) {
      res.status(404).json({ error: "No employee record linked to this account" });
      return;
    }

    const empId = user.employeeId;

    // Fetch all sections in parallel
    const [
      addresses,
      kinRows,
      medicalSelections,
      medicalNotesRow,
      dietarySelections,
      dietaryNotesRow,
      disclosures,
      consents,
    ] = await Promise.all([
      db
        .select()
        .from(employeeAddressesTable)
        .where(eq(employeeAddressesTable.employeeId, empId))
        .orderBy(employeeAddressesTable.createdAt),

      db
        .select()
        .from(employeeNextOfKinTable)
        .where(eq(employeeNextOfKinTable.employeeId, empId))
        .orderBy(employeeNextOfKinTable.createdAt),

      db
        .select({ lovValue: employeeMedicalSelectionsTable.lovValue })
        .from(employeeMedicalSelectionsTable)
        .where(eq(employeeMedicalSelectionsTable.employeeId, empId)),

      db
        .select({ notes: employeeMedicalNotesTable.notes })
        .from(employeeMedicalNotesTable)
        .where(eq(employeeMedicalNotesTable.employeeId, empId))
        .limit(1)
        .then((rows) => rows[0] ?? null),

      db
        .select({ lovValue: employeeDietarySelectionsTable.lovValue })
        .from(employeeDietarySelectionsTable)
        .where(eq(employeeDietarySelectionsTable.employeeId, empId)),

      db
        .select({ notes: employeeDietaryNotesTable.notes })
        .from(employeeDietaryNotesTable)
        .where(eq(employeeDietaryNotesTable.employeeId, empId))
        .limit(1)
        .then((rows) => rows[0] ?? null),

      db
        .select()
        .from(employeeDisclosuresTable)
        .where(eq(employeeDisclosuresTable.employeeId, empId))
        .orderBy(asc(employeeDisclosuresTable.issueDate)),

      db
        .select({
          id: employeeDisclosureConsentsTable.id,
          disclosureId: employeeDisclosureConsentsTable.disclosureId,
          consentGranted: employeeDisclosureConsentsTable.consentGranted,
          signatoryName: employeeDisclosureConsentsTable.signatoryName,
          consentedAt: employeeDisclosureConsentsTable.consentedAt,
          pdfFileUrl: employeeAttachmentsTable.fileUrl,
          pdfFileName: employeeAttachmentsTable.fileName,
        })
        .from(employeeDisclosureConsentsTable)
        .leftJoin(
          employeeAttachmentsTable,
          eq(employeeDisclosureConsentsTable.pdfAttachmentId, employeeAttachmentsTable.id),
        )
        .where(eq(employeeDisclosureConsentsTable.employeeId, empId))
        .orderBy(asc(employeeDisclosureConsentsTable.consentedAt)),
    ]);

    // Attach phones to each next-of-kin record
    const kinWithPhones = await Promise.all(
      kinRows.map(async (kin) => {
        const phones = await db
          .select({
            number: employeeNextOfKinPhonesTable.number,
            label: employeeNextOfKinPhonesTable.label,
          })
          .from(employeeNextOfKinPhonesTable)
          .where(eq(employeeNextOfKinPhonesTable.kinId, kin.id))
          .orderBy(employeeNextOfKinPhonesTable.createdAt);
        return { ...kin, phones };
      }),
    );

    // Generate short-lived signed download URLs for consent PDFs
    const consentsWithUrls = await Promise.all(
      consents.map(async (c) => {
        let pdfSignedUrl: string | null = null;
        if (c.pdfFileUrl) {
          try {
            pdfSignedUrl = await objectStorageService.getSignedDownloadUrl(c.pdfFileUrl);
          } catch {
            // Non-fatal — URL generation failure omits the link
          }
        }
        return {
          id: c.id,
          disclosureId: c.disclosureId,
          consentGranted: c.consentGranted,
          signatoryName: c.signatoryName,
          consentedAt: c.consentedAt,
          pdfSignedUrl,
          pdfFileName: c.pdfFileName ?? null,
        };
      }),
    );

    res.json({
      employeeId: empId,
      addresses,
      nextOfKin: kinWithPhones,
      medical: {
        selections: medicalSelections.map((s) => s.lovValue),
        notes: medicalNotesRow?.notes ?? null,
      },
      dietary: {
        selections: dietarySelections.map((s) => s.lovValue),
        notes: dietaryNotesRow?.notes ?? null,
      },
      disclosures,
      consents: consentsWithUrls,
    });
  },
);

export default router;
