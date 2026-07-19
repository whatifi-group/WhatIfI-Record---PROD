import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, studentsTable } from "@workspace/db";
import { z } from "zod";
import {
  CreateStudentBody,
  UpdateStudentBody,
  GetStudentParams,
  UpdateStudentParams,
  ListStudentsResponse,
  CreateStudentResponse,
  GetStudentResponse,
  UpdateStudentResponse,
} from "@workspace/api-zod";
import { requirePermission } from "../../middlewares/requirePermission";

const router: IRouter = Router();

// format: email isn't compatible with this repo's pinned Zod v3 + orval's
// zod client (see lib/api-spec/openapi.yaml), so the generated bodies don't
// enforce email format — it's layered on here instead.
const CreateStudentInput = CreateStudentBody.extend({
  emailAddress: z.string().email().optional(),
});
const UpdateStudentInput = UpdateStudentBody.extend({
  emailAddress: z.string().email().nullish(),
});

// GET /course-management/students
router.get("/course-management/students", requirePermission(["hr:access", "sysadmin"]), async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(studentsTable)
    .orderBy(asc(studentsTable.lastName), asc(studentsTable.firstName));
  res.json(ListStudentsResponse.parse(rows));
});

// POST /course-management/students
router.post("/course-management/students", requirePermission(["hr:access", "sysadmin"]), async (req, res): Promise<void> => {
  const parsed = CreateStudentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [created] = await db.insert(studentsTable).values(parsed.data).returning();
  res.status(201).json(CreateStudentResponse.parse(created));
});

// GET /course-management/students/:studentId
router.get("/course-management/students/:studentId", requirePermission(["hr:access", "sysadmin"]), async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid studentId" });
    return;
  }

  const [row] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.studentId, params.data.studentId));

  if (!row) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  res.json(GetStudentResponse.parse(row));
});

// PATCH /course-management/students/:studentId
router.patch("/course-management/students/:studentId", requirePermission(["hr:access", "sysadmin"]), async (req, res): Promise<void> => {
  const params = UpdateStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid studentId" });
    return;
  }

  const parsed = UpdateStudentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(studentsTable)
    .set(parsed.data)
    .where(eq(studentsTable.studentId, params.data.studentId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  res.json(UpdateStudentResponse.parse(updated));
});

export default router;
