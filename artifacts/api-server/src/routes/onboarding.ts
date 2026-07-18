/**
 * Onboarding routes — self-service new-hire flow.
 *
 * Public (no session required):
 *   POST /api/onboarding/verify              — validate shared password → return JWT
 *
 * Onboarding-JWT gated (no HR session required):
 *   POST /api/onboarding/submit              — submit onboarding form
 *   POST /api/onboarding/upload-url          — get presigned upload URL for cert
 *   GET  /api/onboarding/qualification-types — LOV for qualification types
 *   GET  /api/onboarding/lov/medical-conditions    — LOV for medical conditions
 *   GET  /api/onboarding/lov/dietary-requirements  — LOV for dietary requirements
 *
 * HR/SysAdmin only:
 *   GET  /api/onboarding/submissions           — paginated list
 *   GET  /api/onboarding/submissions/:id       — full detail
 *   POST /api/onboarding/submissions/:id/approve
 *   POST /api/onboarding/submissions/:id/reject
 *   GET  /api/onboarding/passphrase-status
 *   PATCH /api/onboarding/passphrase
 */
import { Router, type IRouter } from "express";
import { and, eq, desc, count, asc, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  lovItemsTable,
  onboardingSubmissionsTable,
  onboardingSubmissionQualificationsTable,
  onboardingAddressesTable,
  onboardingNextOfKinTable,
  onboardingNextOfKinPhonesTable,
  onboardingMedicalTable,
  onboardingDisclosuresTable,
  onboardingPayrollTable,
  employeesTable,
  employeePhonesTable,
  employeeQualificationsTable,
  qualificationTypesTable,
  qualificationCertificatesTable,
  employeeAddressesTable,
  employeeNextOfKinTable,
  employeeNextOfKinPhonesTable,
  employeeMedicalSelectionsTable,
  employeeMedicalNotesTable,
  employeeDietarySelectionsTable,
  employeeDietaryNotesTable,
  employeeDisclosuresTable,
  employeeAttachmentsTable,
  employeeDisclosureConsentsTable,
  employeePayrollTable,
  usersTable,
  rolesTable,
  employeeServicePeriodsTable,
} from "@workspace/db";
import { requirePermission } from "../middlewares/requirePermission";
import { requireOnboardingSession } from "../middlewares/requireOnboardingSession";
import { signOnboardingToken } from "../lib/onboardingJwt";
import { hashPassword } from "../lib/password";
import crypto from "node:crypto";
import { objectStorageService } from "./storage";
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_CONTENT_TYPES,
} from "../lib/uploadPolicy";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

const AddressInput = z.object({
  line1: z.string().optional().nullable(),
  line2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  county: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
}).optional().nullable();

const PhoneInput = z.object({
  number: z.string().min(1),
  label: z.string().default("Mobile"),
  isPrimary: z.boolean().default(false),
});

const NextOfKinInput = z.object({
  name: z.string().min(1),
  relationship: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phones: z.array(PhoneInput).optional().default([]),
}).optional().nullable();

const MedicalInput = z.object({
  medicalSelections: z.array(z.string()).optional().default([]),
  medicalNotes: z.string().optional().nullable(),
  dietarySelections: z.array(z.string()).optional().default([]),
  dietaryNotes: z.string().optional().nullable(),
}).optional().nullable();

const DisclosureSubmitInput = z.object({
  checkType: z.enum(["dbs", "pvg", "access_ni"]),
  checkLevel: z.enum(["basic", "standard", "enhanced", "enhanced_barred"]),
  certificateNumber: z.string().optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  onUpdateService: z.boolean().default(false),
  updateServiceConsentName: z.string().optional().nullable(),
  convictionDetails: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).optional().nullable();

const PayrollSubmitInput = z.object({
  niNumber: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  accountHolder: z.string().optional().nullable(),
  sortCode: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
}).optional().nullable();

const SubmitBody = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  // Optional — HR sets the start date and these fields at approval time
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  jobTitle: z.string().max(200).optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
  employmentType: z.string().optional().nullable(),
  qualifications: z.array(SubmissionQualificationInput).optional().default([]),
  // Extended optional sections
  address: AddressInput,
  nextOfKin: NextOfKinInput,
  medical: MedicalInput,
  disclosure: DisclosureSubmitInput,
  payroll: PayrollSubmitInput,
});

const SubmissionsQuery = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const ApproveBody = z.object({
  userRole: z.number().int().positive().optional(),
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
    .where(eq(onboardingSubmissionQualificationsTable.submissionId, submissionId));

  for (const qual of quals) {
    const [inserted] = await tx
      .insert(employeeQualificationsTable)
      .values({
        employeeId,
        qualificationTypeId: qual.qualificationTypeId,
        dateAchieved: qual.dateAchieved,
        expiryDate: qual.expiryDate,
        notes: qual.notes,
        verificationStatus: "pending",
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

/**
 * Copy staged address, next-of-kin, medical, dietary, disclosure, and payroll
 * rows from the staging tables into the proper employee tables.
 * Also generates and uploads the Update Service consent PDF if applicable.
 * Creates an employee_disclosure_update_service_consents row for every approval.
 */
async function copySubmissionExtendedData(
  tx: DbOrTx,
  submissionId: number,
  employeeId: number,
  employeeName: string,
  ipAddress: string | null,
): Promise<void> {
  // ── Address ──────────────────────────────────────────────────────────────
  const [stagedAddress] = await tx
    .select()
    .from(onboardingAddressesTable)
    .where(eq(onboardingAddressesTable.submissionId, submissionId))
    .limit(1);

  if (stagedAddress) {
    await tx.insert(employeeAddressesTable).values({
      employeeId,
      addressType: "home",
      line1: stagedAddress.line1 ?? "",
      line2: stagedAddress.line2,
      city: stagedAddress.city,
      county: stagedAddress.county,
      postcode: stagedAddress.postcode,
      country: stagedAddress.country,
      isPrimary: true,
    });
  }

  // ── Next of Kin ──────────────────────────────────────────────────────────
  const [stagedKin] = await tx
    .select()
    .from(onboardingNextOfKinTable)
    .where(eq(onboardingNextOfKinTable.submissionId, submissionId))
    .limit(1);

  if (stagedKin) {
    const [kin] = await tx
      .insert(employeeNextOfKinTable)
      .values({
        employeeId,
        name: stagedKin.name,
        relationship: stagedKin.relationship,
        email: stagedKin.email,
        address: stagedKin.address,
      })
      .returning();

    const stagedKinPhones = await tx
      .select()
      .from(onboardingNextOfKinPhonesTable)
      .where(eq(onboardingNextOfKinPhonesTable.kinId, stagedKin.id))
      .orderBy(asc(onboardingNextOfKinPhonesTable.id));

    if (kin && stagedKinPhones.length > 0) {
      await tx.insert(employeeNextOfKinPhonesTable).values(
        stagedKinPhones.map((p) => ({
          kinId: kin.id,
          number: p.number,
          label: p.label,
          isPrimary: p.isPrimary,
        })),
      );
    }
  }

  // ── Medical & Dietary ────────────────────────────────────────────────────
  const [stagedMedical] = await tx
    .select()
    .from(onboardingMedicalTable)
    .where(eq(onboardingMedicalTable.submissionId, submissionId))
    .limit(1);

  if (stagedMedical) {
    if (stagedMedical.medicalSelections && stagedMedical.medicalSelections.length > 0) {
      await tx.insert(employeeMedicalSelectionsTable).values(
        stagedMedical.medicalSelections.map((v: string) => ({ employeeId, lovValue: v })),
      );
    }
    if (stagedMedical.medicalNotes) {
      await tx
        .insert(employeeMedicalNotesTable)
        .values({ employeeId, notes: stagedMedical.medicalNotes })
        .onConflictDoUpdate({
          target: employeeMedicalNotesTable.employeeId,
          set: { notes: stagedMedical.medicalNotes },
        });
    }
    if (stagedMedical.dietarySelections && stagedMedical.dietarySelections.length > 0) {
      await tx.insert(employeeDietarySelectionsTable).values(
        stagedMedical.dietarySelections.map((v: string) => ({ employeeId, lovValue: v })),
      );
    }
    if (stagedMedical.dietaryNotes) {
      await tx
        .insert(employeeDietaryNotesTable)
        .values({ employeeId, notes: stagedMedical.dietaryNotes })
        .onConflictDoUpdate({
          target: employeeDietaryNotesTable.employeeId,
          set: { notes: stagedMedical.dietaryNotes },
        });
    }
  }

  // ── Disclosure + Consent ─────────────────────────────────────────────────
  const [stagedDisclosure] = await tx
    .select()
    .from(onboardingDisclosuresTable)
    .where(eq(onboardingDisclosuresTable.submissionId, submissionId))
    .limit(1);

  let disclosureId: number | null = null;
  let consentGranted = false;
  let signatoryName: string | null = null;
  let consentedAt: Date | null = null;
  let pdfAttachmentId: number | null = null;

  if (stagedDisclosure) {
    const [empDisclosure] = await tx
      .insert(employeeDisclosuresTable)
      .values({
        employeeId,
        checkType: stagedDisclosure.checkType as "dbs" | "pvg" | "access_ni",
        checkLevel: stagedDisclosure.checkLevel as
          | "basic"
          | "standard"
          | "enhanced"
          | "enhanced_barred",
        certificateNumber: stagedDisclosure.certificateNumber,
        issueDate: stagedDisclosure.issueDate ?? new Date().toISOString().slice(0, 10),
        onUpdateService: stagedDisclosure.onUpdateService,
        convictionDetails: stagedDisclosure.convictionDetails,
        notes: stagedDisclosure.notes,
      })
      .returning();

    disclosureId = empDisclosure.id;
    consentGranted =
      stagedDisclosure.onUpdateService &&
      !!stagedDisclosure.updateServiceConsentName;
    signatoryName = stagedDisclosure.updateServiceConsentName ?? null;
    consentedAt = consentGranted ? new Date() : null;

    // Generate and upload the PDF if consent was given
    if (consentGranted && signatoryName) {
      try {
        const pdfBuffer = await generateConsentPdf({
          employeeName: employeeName,
          checkType: stagedDisclosure.checkType,
          checkLevel: stagedDisclosure.checkLevel,
          certificateNumber: stagedDisclosure.certificateNumber ?? null,
          issueDate: stagedDisclosure.issueDate ?? null,
          signatoryName,
          consentedAt: consentedAt!.toISOString(),
        });

        const objectPath = await objectStorageService.uploadBuffer(
          pdfBuffer,
          "application/pdf",
        );

        const [attachment] = await tx
          .insert(employeeAttachmentsTable)
          .values({
            employeeId,
            fileName: `update-service-consent-${employeeId}.pdf`,
            fileUrl: objectPath,
            fileType: "application/pdf",
          })
          .returning();

        pdfAttachmentId = attachment.id;
      } catch (err) {
        // PDF generation/upload failure is non-fatal — the consent row is
        // still written with pdf_attachment_id = null as an audit record.
        console.error("Failed to generate/upload consent PDF:", err);
      }
    }
  }

  // ── Consent record (always written if a disclosure was submitted) ─────────
  if (stagedDisclosure) {
    await tx.insert(employeeDisclosureConsentsTable).values({
      employeeId,
      disclosureId,
      consentGranted,
      signatoryName,
      consentedAt,
      ipAddress,
      pdfAttachmentId,
    });
  }

  // ── Payroll / Bank Details ─────────────────────────────────────────────────
  const [stagedPayroll] = await tx
    .select()
    .from(onboardingPayrollTable)
    .where(eq(onboardingPayrollTable.submissionId, submissionId))
    .limit(1);

  if (stagedPayroll) {
    await tx.insert(employeePayrollTable).values({
      employeeId,
      niNumber: stagedPayroll.niNumber,
      bankName: stagedPayroll.bankName,
      accountHolder: stagedPayroll.accountHolder,
      sortCode: stagedPayroll.sortCode,
      accountNumber: stagedPayroll.accountNumber,
    });
  }
}

/** Generate an Update Service consent PDF as a Buffer using pdf-lib. */
async function generateConsentPdf(params: {
  employeeName: string;
  checkType: string;
  checkLevel: string;
  certificateNumber: string | null;
  issueDate: string | null;
  signatoryName: string;
  consentedAt: string;
}): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595.28, 841.89]); // A4 points
  const { width, height } = page.getSize();
  const margin = 60;
  let y = height - margin;

  const black = rgb(0, 0, 0);
  const grey = rgb(0.4, 0.4, 0.4);
  const blue = rgb(0.1, 0.34, 0.6);

  const typeLabel: Record<string, string> = { dbs: "DBS", pvg: "PVG", access_ni: "AccessNI" };
  const levelLabel: Record<string, string> = {
    basic: "Basic",
    standard: "Standard",
    enhanced: "Enhanced",
    enhanced_barred: "Enhanced with Barred Lists",
  };

  function drawLine() {
    page.drawLine({
      start: { x: margin, y: y + 2 },
      end: { x: width - margin, y: y + 2 },
      thickness: 0.5,
      color: grey,
    });
    y -= 14;
  }

  function drawText(
    text: string,
    opts: {
      fontSize?: number;
      font?: typeof fontNormal;
      color?: ReturnType<typeof rgb>;
      x?: number;
    } = {},
  ) {
    const fontSize = opts.fontSize ?? 11;
    const font = opts.font ?? fontNormal;
    const color = opts.color ?? black;
    const x = opts.x ?? margin;
    page.drawText(text, { x, y, size: fontSize, font, color });
    y -= fontSize * 1.6;
  }

  // Wrap text to max width, return line strings
  function wrapText(text: string, fontSize: number): string[] {
    const maxW = width - margin * 2;
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (fontNormal.widthOfTextAtSize(candidate, fontSize) > maxW && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // ── Title ──────────────────────────────────────────────────────────────────
  drawText("Update Service Consent Certificate", { fontSize: 18, font: fontBold, color: blue });
  y -= 4;
  drawText(
    "This document records the employee's informed consent to periodic Update Service checks.",
    { fontSize: 9, color: grey },
  );
  y -= 18;

  // ── Employee details ───────────────────────────────────────────────────────
  drawText("Employee & Disclosure Details", { fontSize: 13, font: fontBold });
  drawLine();
  drawText(`Name:  ${params.employeeName}`);
  drawText(`Check Type:  ${typeLabel[params.checkType] ?? params.checkType}`);
  drawText(`Check Level:  ${levelLabel[params.checkLevel] ?? params.checkLevel}`);
  if (params.certificateNumber) drawText(`Certificate Number:  ${params.certificateNumber}`);
  if (params.issueDate) drawText(`Certificate Issue Date:  ${params.issueDate}`);
  y -= 18;

  // ── Consent declaration ───────────────────────────────────────────────────
  drawText("Consent Declaration", { fontSize: 13, font: fontBold });
  drawLine();
  const consentText =
    "We may conduct a check of the Update Service at intervals of not more than 28 days. " +
    "By signing below, the employee consents to the employer conducting these periodic " +
    "checks for the duration of their employment, or until consent is withdrawn in writing " +
    "to the HR department.";
  for (const ln of wrapText(consentText, 11)) {
    drawText(ln);
  }
  y -= 18;

  // ── Signature ─────────────────────────────────────────────────────────────
  drawText("Employee Signature (typed consent)", { fontSize: 13, font: fontBold });
  drawLine();
  drawText("I have read and understood the above consent declaration.");
  y -= 8;
  drawText(`/s/  ${params.signatoryName}`, { fontSize: 16, font: fontBold });
  y -= 12;
  drawText(`Timestamp: ${params.consentedAt}`, { fontSize: 9, color: grey });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
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
      error: "Onboarding is not currently open. Please contact HR for access.",
    });
    return;
  }

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

// ── GET /api/onboarding/qualification-types ───────────────────────────────────

router.get(
  "/onboarding/qualification-types",
  requireOnboardingSession,
  async (_req, res): Promise<void> => {
    const types = await db
      .select({
        id: qualificationTypesTable.id,
        name: qualificationTypesTable.name,
        requiresExpiry:
          sql<boolean>`${qualificationTypesTable.validityUnit} IS NOT NULL`,
      })
      .from(qualificationTypesTable)
      .where(eq(qualificationTypesTable.isActive, true))
      .orderBy(asc(qualificationTypesTable.name));

    res.json(types);
  },
);

// ── GET /api/onboarding/lov/medical-conditions ────────────────────────────────

router.get(
  "/onboarding/lov/medical-conditions",
  requireOnboardingSession,
  async (_req, res): Promise<void> => {
    const items = await db
      .select({ value: lovItemsTable.value, label: lovItemsTable.label })
      .from(lovItemsTable)
      .where(
        and(
          eq(lovItemsTable.category, "medical_condition"),
          eq(lovItemsTable.isActive, true),
        ),
      )
      .orderBy(asc(lovItemsTable.sortOrder), asc(lovItemsTable.label));
    res.json(items);
  },
);

// ── GET /api/onboarding/lov/dietary-requirements ──────────────────────────────

router.get(
  "/onboarding/lov/dietary-requirements",
  requireOnboardingSession,
  async (_req, res): Promise<void> => {
    const items = await db
      .select({ value: lovItemsTable.value, label: lovItemsTable.label })
      .from(lovItemsTable)
      .where(
        and(
          eq(lovItemsTable.category, "dietary_requirement"),
          eq(lovItemsTable.isActive, true),
        ),
      )
      .orderBy(asc(lovItemsTable.sortOrder), asc(lovItemsTable.label));
    res.json(items);
  },
);

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

    const { qualifications, address, nextOfKin, medical, disclosure, payroll, ...profileData } =
      parsed.data;

    const result = await db.transaction(async (tx) => {
      const [submission] = await tx
        .insert(onboardingSubmissionsTable)
        .values({
          ...profileData,
          email: profileData.email.toLowerCase(),
          onboardingStatus: "pending",
        })
        .returning();

      if (qualifications.length > 0) {
        await tx.insert(onboardingSubmissionQualificationsTable).values(
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

      if (address) {
        await tx.insert(onboardingAddressesTable).values({
          submissionId: submission.id,
          line1: address.line1 ?? null,
          line2: address.line2 ?? null,
          city: address.city ?? null,
          county: address.county ?? null,
          postcode: address.postcode ?? null,
          country: address.country ?? null,
        });
      }

      if (nextOfKin) {
        const [kin] = await tx
          .insert(onboardingNextOfKinTable)
          .values({
            submissionId: submission.id,
            name: nextOfKin.name,
            relationship: nextOfKin.relationship ?? null,
            email: nextOfKin.email ?? null,
            address: nextOfKin.address ?? null,
          })
          .returning();

        if (kin && nextOfKin.phones && nextOfKin.phones.length > 0) {
          await tx.insert(onboardingNextOfKinPhonesTable).values(
            nextOfKin.phones.map((p) => ({
              kinId: kin.id,
              number: p.number,
              label: p.label,
              isPrimary: p.isPrimary,
            })),
          );
        }
      }

      if (medical) {
        await tx.insert(onboardingMedicalTable).values({
          submissionId: submission.id,
          medicalSelections: medical.medicalSelections ?? [],
          medicalNotes: medical.medicalNotes ?? null,
          dietarySelections: medical.dietarySelections ?? [],
          dietaryNotes: medical.dietaryNotes ?? null,
        });
      }

      if (disclosure) {
        await tx.insert(onboardingDisclosuresTable).values({
          submissionId: submission.id,
          checkType: disclosure.checkType,
          checkLevel: disclosure.checkLevel,
          certificateNumber: disclosure.certificateNumber ?? null,
          issueDate: disclosure.issueDate ?? null,
          onUpdateService: disclosure.onUpdateService,
          updateServiceConsentName: disclosure.updateServiceConsentName ?? null,
          convictionDetails: disclosure.convictionDetails ?? null,
          notes: disclosure.notes ?? null,
        });
      }

      if (payroll) {
        await tx.insert(onboardingPayrollTable).values({
          submissionId: submission.id,
          niNumber: payroll.niNumber ?? null,
          bankName: payroll.bankName ?? null,
          accountHolder: payroll.accountHolder ?? null,
          sortCode: payroll.sortCode ?? null,
          accountNumber: payroll.accountNumber ?? null,
        });
      }

      return submission;
    });

    res.status(201).json({ id: result.id, status: result.onboardingStatus });
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
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: count() })
      .from(onboardingSubmissionsTable)
      .where(whereClause);

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
      .where(whereClause)
      .orderBy(desc(onboardingSubmissionsTable.submittedAt))
      .limit(pageSize)
      .offset(offset);

    res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
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
        qualificationTypeId: onboardingSubmissionQualificationsTable.qualificationTypeId,
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
      .where(eq(onboardingSubmissionQualificationsTable.submissionId, params.data.id));

    const [address] = await db
      .select()
      .from(onboardingAddressesTable)
      .where(eq(onboardingAddressesTable.submissionId, params.data.id))
      .limit(1);

    const [nextOfKin] = await db
      .select()
      .from(onboardingNextOfKinTable)
      .where(eq(onboardingNextOfKinTable.submissionId, params.data.id))
      .limit(1);

    const nextOfKinPhones = nextOfKin
      ? await db
          .select()
          .from(onboardingNextOfKinPhonesTable)
          .where(eq(onboardingNextOfKinPhonesTable.kinId, nextOfKin.id))
      : [];

    const [medical] = await db
      .select()
      .from(onboardingMedicalTable)
      .where(eq(onboardingMedicalTable.submissionId, params.data.id))
      .limit(1);

    const [disclosure] = await db
      .select()
      .from(onboardingDisclosuresTable)
      .where(eq(onboardingDisclosuresTable.submissionId, params.data.id))
      .limit(1);

    // Bank/payroll details are only shown to reviewers who could already see
    // the same data on a live employee's Payroll tab — hr:access alone does
    // not grant that elsewhere in the app, so it shouldn't here either.
    const canViewPayroll =
      req.effectivePermissions?.has("view_payroll") ||
      req.effectivePermissions?.has("sysadmin");
    const [payroll] = canViewPayroll
      ? await db
          .select()
          .from(onboardingPayrollTable)
          .where(eq(onboardingPayrollTable.submissionId, params.data.id))
          .limit(1)
      : [];

    res.json({
      ...submission,
      qualifications,
      address: address ?? null,
      nextOfKin: nextOfKin ? { ...nextOfKin, phones: nextOfKinPhones } : null,
      medical: medical ?? null,
      disclosure: disclosure ?? null,
      payroll: payroll ?? null,
    });
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

    let roleId = body.data.userRole;
    if (!roleId) {
      const [selfServiceRole] = await db
        .select({ id: rolesTable.id })
        .from(rolesTable)
        .where(eq(rolesTable.name, "Employee Self-Service"))
        .limit(1);
      if (!selfServiceRole) {
        res
          .status(500)
          .json({ error: "Employee Self-Service role not found — run seed first" });
        return;
      }
      roleId = selfServiceRole.id;
    }

    const tempPassword = generateTempPassword();
    const today = new Date().toISOString().slice(0, 10);
    const reviewerId = (req as any).session?.userId ?? null;
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      null;

    let result: { employeeId: number } | null;
    try {
    result = await db.transaction(async (tx) => {
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
        return null;
      }

      // 1. Insert active employee
      const [employee] = await tx
        .insert(employeesTable)
        .values({
          firstName: submission.firstName,
          lastName: submission.lastName,
          email: submission.email,
          jobTitle: submission.jobTitle ?? "To be confirmed",
          departmentId: submission.departmentId,
          employmentType: submission.employmentType ?? "full_time",
          startDate: submission.startDate ?? today,
          status: "active",
        })
        .returning();

      // Migrate submission phone → employee_phones
      if (submission.phone) {
        await tx.insert(employeePhonesTable).values({
          employeeId: employee.id,
          number: submission.phone,
          label: "Mobile",
          isPrimary: true,
        });
      }

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

      // 4. Copy extended staged data (address, kin, medical, dietary, disclosure, consent)
      await copySubmissionExtendedData(
        tx,
        submission.id,
        employee.id,
        `${submission.firstName} ${submission.lastName}`,
        ipAddress,
      );

      // 5. Set employeeId FK back on the submission row
      await tx
        .update(onboardingSubmissionsTable)
        .set({ employeeId: employee.id, updatedAt: new Date() })
        .where(eq(onboardingSubmissionsTable.id, submission.id));

      return { employeeId: employee.id };
    });
    } catch (txErr) {
      console.error("[approve] transaction failed:", txErr);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    if (result === null) {
      const [existing] = await db
        .select({
          id: onboardingSubmissionsTable.id,
          onboardingStatus: onboardingSubmissionsTable.onboardingStatus,
        })
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

      // Insert employee with status = leaver (audit record)
      const [employee] = await tx
        .insert(employeesTable)
        .values({
          firstName: submission.firstName,
          lastName: submission.lastName,
          email: submission.email,
          jobTitle: submission.jobTitle ?? "N/A",
          departmentId: submission.departmentId,
          employmentType: submission.employmentType ?? "full_time",
          startDate: submission.startDate ?? today,
          status: "leaver",
          leaverReason: body.data.leaverReason,
          leaverDate: today,
        })
        .returning();

      if (submission.phone) {
        await tx.insert(employeePhonesTable).values({
          employeeId: employee.id,
          number: submission.phone,
          label: "Mobile",
          isPrimary: true,
        });
      }

      await copySubmissionQualifications(tx, submission.id, employee.id);

      await tx
        .update(onboardingSubmissionsTable)
        .set({ employeeId: employee.id, updatedAt: new Date() })
        .where(eq(onboardingSubmissionsTable.id, submission.id));

      return { employeeId: employee.id };
    });

    if (result === null) {
      const [existing] = await db
        .select({
          id: onboardingSubmissionsTable.id,
          onboardingStatus: onboardingSubmissionsTable.onboardingStatus,
        })
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

// ── POST /api/onboarding/upload-url ──────────────────────────────────────────

const UploadUrlBody = z.object({
  name: z.string().min(1),
  size: z.number().int().positive(),
  contentType: z.string().min(1),
});

router.post(
  "/onboarding/upload-url",
  requireOnboardingSession,
  async (req, res): Promise<void> => {
    const parsed = UploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Missing or invalid fields: name, size, contentType required" });
      return;
    }

    const { name, size, contentType } = parsed.data;

    if (size > MAX_FILE_SIZE_BYTES) {
      res.status(400).json({
        error: `File size exceeds the 20 MB limit (received ${(size / 1024 / 1024).toFixed(1)} MB).`,
      });
      return;
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      res.status(400).json({
        error: `File type "${contentType}" is not allowed. Accepted types: PDF, PNG, JPEG, GIF, WEBP, HEIC.`,
      });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      console.error("Error generating upload URL", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

// ── GET /api/onboarding/passphrase-status ────────────────────────────────────

router.get(
  "/onboarding/passphrase-status",
  requirePermission(["hr:access", "sysadmin"]),
  async (_req, res): Promise<void> => {
    const passphrase = await getOnboardingPassphrase();
    res.json({ isSet: passphrase !== null });
  },
);

// ── PATCH /api/onboarding/passphrase ─────────────────────────────────────────

const PatchPassphraseBody = z.object({
  passphrase: z.string().min(6, "Passphrase must be at least 6 characters"),
  confirm: z.string().min(1),
});

router.patch(
  "/onboarding/passphrase",
  requirePermission(["hr:access", "sysadmin"]),
  async (req, res): Promise<void> => {
    const parsed = PatchPassphraseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
      return;
    }

    const { passphrase, confirm } = parsed.data;
    if (passphrase !== confirm) {
      res.status(400).json({ error: "Passphrase and confirmation do not match" });
      return;
    }

    const [existing] = await db
      .select({ id: lovItemsTable.id })
      .from(lovItemsTable)
      .where(
        and(
          eq(lovItemsTable.category, "system_config"),
          eq(lovItemsTable.value, "onboarding_password"),
        ),
      )
      .limit(1);

    if (!existing) {
      res
        .status(500)
        .json({ error: "Onboarding passphrase LOV row not found — run seed first" });
      return;
    }

    await db
      .update(lovItemsTable)
      .set({ label: passphrase, isActive: true })
      .where(eq(lovItemsTable.id, existing.id));

    res.json({ success: true, isSet: true });
  },
);

export default router;
