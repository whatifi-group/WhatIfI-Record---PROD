/**
 * Employee directory — restricted view for self-service users.
 *
 * GET /api/directory          — active employees: id, name, jobTitle, email, phone
 * GET /api/directory/:id      — same base fields + next-of-kin + qualifications
 *
 * Both routes require the `view_employee_directory` permission.
 * Salary, pay rates, and medical data are excluded at the query level.
 */
import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  employeesTable,
  employeeNextOfKinTable,
  employeeQualificationsTable,
  qualificationTypesTable,
  qualificationCertificatesTable,
} from "@workspace/db";
import { requirePermission } from "../middlewares/requirePermission";

const router: IRouter = Router();

const IdParam = z.object({ employeeId: z.coerce.number().int().positive() });

// ── GET /api/directory ────────────────────────────────────────────────────────

router.get(
  "/directory",
  requirePermission(["view_employee_directory"]),
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
        jobTitle: employeesTable.jobTitle,
        email: employeesTable.email,
        phone: employeesTable.phone,
      })
      .from(employeesTable)
      .where(eq(employeesTable.status, "active"))
      .orderBy(asc(employeesTable.lastName), asc(employeesTable.firstName));

    res.json(rows);
  },
);

// ── GET /api/directory/:employeeId ────────────────────────────────────────────

router.get(
  "/directory/:employeeId",
  requirePermission(["view_employee_directory"]),
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [employee] = await db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
        jobTitle: employeesTable.jobTitle,
        email: employeesTable.email,
        phone: employeesTable.phone,
      })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, params.data.employeeId),
          eq(employeesTable.status, "active"),
        ),
      )
      .limit(1);

    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    // Next of kin — name, relationship, phone, email (no address)
    const nextOfKin = await db
      .select({
        id: employeeNextOfKinTable.id,
        name: employeeNextOfKinTable.name,
        relationship: employeeNextOfKinTable.relationship,
        phone: employeeNextOfKinTable.phone,
        email: employeeNextOfKinTable.email,
      })
      .from(employeeNextOfKinTable)
      .where(eq(employeeNextOfKinTable.employeeId, params.data.employeeId))
      .orderBy(asc(employeeNextOfKinTable.createdAt));

    // Qualifications with type name + certificate URLs
    const qualifications = await db
      .select({
        id: employeeQualificationsTable.id,
        qualificationTypeId: employeeQualificationsTable.qualificationTypeId,
        qualificationTypeName: qualificationTypesTable.name,
        dateAchieved: employeeQualificationsTable.dateAchieved,
        expiryDate: employeeQualificationsTable.expiryDate,
        notes: employeeQualificationsTable.notes,
        certFileUrl: qualificationCertificatesTable.fileUrl,
        certFileName: qualificationCertificatesTable.fileName,
      })
      .from(employeeQualificationsTable)
      .leftJoin(
        qualificationTypesTable,
        eq(
          employeeQualificationsTable.qualificationTypeId,
          qualificationTypesTable.id,
        ),
      )
      .leftJoin(
        qualificationCertificatesTable,
        eq(
          qualificationCertificatesTable.qualificationId,
          employeeQualificationsTable.id,
        ),
      )
      .where(
        eq(employeeQualificationsTable.employeeId, params.data.employeeId),
      )
      .orderBy(asc(employeeQualificationsTable.createdAt));

    res.json({ ...employee, nextOfKin, qualifications });
  },
);

export default router;
