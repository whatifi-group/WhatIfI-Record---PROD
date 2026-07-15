/**
 * Employee directory — restricted view for self-service users.
 *
 * GET /api/directory          — active employees: id, name, jobTitle, email, phones
 * GET /api/directory/:id      — same base fields + next-of-kin (with phones) + qualifications
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
  employeeNextOfKinPhonesTable,
  employeePhonesTable,
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
      })
      .from(employeesTable)
      .where(eq(employeesTable.status, "active"))
      .orderBy(asc(employeesTable.lastName), asc(employeesTable.firstName));

    // Attach primary phone for each employee
    const withPhones = await Promise.all(
      rows.map(async (emp) => {
        const phones = await db
          .select({ number: employeePhonesTable.number, label: employeePhonesTable.label })
          .from(employeePhonesTable)
          .where(eq(employeePhonesTable.employeeId, emp.id))
          .orderBy(employeePhonesTable.createdAt);
        return { ...emp, phones };
      }),
    );

    res.json(withPhones);
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

    // Employee phones
    const phones = await db
      .select({ number: employeePhonesTable.number, label: employeePhonesTable.label })
      .from(employeePhonesTable)
      .where(eq(employeePhonesTable.employeeId, params.data.employeeId))
      .orderBy(employeePhonesTable.createdAt);

    // Next of kin — name, relationship, email (no address); with their phones
    const kinRows = await db
      .select({
        id: employeeNextOfKinTable.id,
        name: employeeNextOfKinTable.name,
        relationship: employeeNextOfKinTable.relationship,
        email: employeeNextOfKinTable.email,
      })
      .from(employeeNextOfKinTable)
      .where(eq(employeeNextOfKinTable.employeeId, params.data.employeeId))
      .orderBy(asc(employeeNextOfKinTable.createdAt));

    const nextOfKin = await Promise.all(
      kinRows.map(async (kin) => {
        const kinPhones = await db
          .select({ number: employeeNextOfKinPhonesTable.number, label: employeeNextOfKinPhonesTable.label })
          .from(employeeNextOfKinPhonesTable)
          .where(eq(employeeNextOfKinPhonesTable.kinId, kin.id))
          .orderBy(employeeNextOfKinPhonesTable.createdAt);
        return { ...kin, phones: kinPhones };
      }),
    );

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
        eq(employeeQualificationsTable.qualificationTypeId, qualificationTypesTable.id),
      )
      .leftJoin(
        qualificationCertificatesTable,
        eq(qualificationCertificatesTable.qualificationId, employeeQualificationsTable.id),
      )
      .where(eq(employeeQualificationsTable.employeeId, params.data.employeeId))
      .orderBy(asc(employeeQualificationsTable.createdAt));

    res.json({ ...employee, phones, nextOfKin, qualifications });
  },
);

export default router;
