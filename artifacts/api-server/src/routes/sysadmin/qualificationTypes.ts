import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, qualificationTypesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const QualificationTypeInput = z.object({
  name: z.string().min(1),
  awardingBody: z.string().optional().nullable(),
  validityValue: z.number().int().positive().optional().nullable(),
  validityUnit: z.enum(["days", "months", "years"]).optional().nullable(),
  isActive: z.boolean().optional(),
});

const QualificationTypeUpdate = z.object({
  name: z.string().min(1).optional(),
  awardingBody: z.string().optional().nullable(),
  validityValue: z.number().int().positive().optional().nullable(),
  validityUnit: z.enum(["days", "months", "years"]).optional().nullable(),
  isActive: z.boolean().optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

// ── CSV helpers ──────────────────────────────────────────────────────────────

const VALID_UNITS = new Set(["days", "months", "years"]);

/**
 * Parse a raw CSV string into an array of row objects.
 * Expects a header row followed by data rows.
 * Returns parsed rows + per-row validation errors.
 */
function parseCsv(raw: string): {
  rows: Array<{
    name: string;
    awardingBody?: string;
    validityValue?: number;
    validityUnit?: "days" | "months" | "years";
    isActive: boolean;
  }>;
  errors: Array<{ row: number; message: string }>;
} {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: [{ row: 0, message: "File must contain a header row and at least one data row" }] };
  }

  const headers = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const nameIdx = headers.indexOf("name");
  if (nameIdx === -1) {
    return { rows: [], errors: [{ row: 0, message: 'Missing required "name" column in header' }] };
  }

  const awardingBodyIdx = headers.indexOf("awardingbody");
  const validityValueIdx = headers.indexOf("validityvalue");
  const validityUnitIdx = headers.indexOf("validityunit");
  const isActiveIdx = headers.indexOf("isactive");

  const rows: ReturnType<typeof parseCsv>["rows"] = [];
  const errors: ReturnType<typeof parseCsv>["errors"] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const rowNum = i + 1;

    const name = nameIdx < cells.length ? cells[nameIdx] : "";
    if (!name) {
      errors.push({ row: rowNum, message: "Name is required" });
      continue;
    }

    let validityValue: number | undefined;
    if (validityValueIdx !== -1 && cells[validityValueIdx]) {
      const v = parseInt(cells[validityValueIdx], 10);
      if (isNaN(v) || v <= 0) {
        errors.push({ row: rowNum, message: `Invalid validityValue "${cells[validityValueIdx]}" — must be a positive integer` });
        continue;
      }
      validityValue = v;
    }

    let validityUnit: "days" | "months" | "years" | undefined;
    if (validityUnitIdx !== -1 && cells[validityUnitIdx]) {
      const u = cells[validityUnitIdx].toLowerCase();
      if (!VALID_UNITS.has(u)) {
        errors.push({ row: rowNum, message: `Invalid validityUnit "${cells[validityUnitIdx]}" — must be days, months, or years` });
        continue;
      }
      validityUnit = u as "days" | "months" | "years";
    }

    if ((validityValue != null) !== (validityUnit != null)) {
      errors.push({ row: rowNum, message: "validityValue and validityUnit must both be provided or both be empty" });
      continue;
    }

    const isActiveRaw = isActiveIdx !== -1 ? cells[isActiveIdx]?.toLowerCase() : "";
    const isActive = isActiveRaw === "false" || isActiveRaw === "0" ? false : true;

    const awardingBody = awardingBodyIdx !== -1 && cells[awardingBodyIdx] ? cells[awardingBodyIdx] : undefined;

    rows.push({ name, awardingBody, validityValue, validityUnit, isActive });
  }

  return { rows, errors };
}

// POST /sysadmin/qualification-types/import
router.post("/sysadmin/qualification-types/import", async (req, res): Promise<void> => {
  const raw = typeof req.body === "string" ? req.body : "";
  if (!raw.trim()) {
    res.status(400).json({ error: "Request body is empty" });
    return;
  }

  const { rows, errors } = parseCsv(raw);

  if (rows.length === 0 && errors.length > 0 && errors[0].row === 0) {
    // Fatal parse error (bad header etc.)
    res.status(400).json({ error: errors[0].message });
    return;
  }

  let imported = 0;
  const skipped = errors.length;

  for (const row of rows) {
    try {
      await db.insert(qualificationTypesTable).values(row);
      imported++;
    } catch {
      errors.push({ row: 0, message: `DB error inserting "${row.name}"` });
    }
  }

  res.json({ imported, skipped, errors });
});

// GET /sysadmin/qualification-types
router.get("/sysadmin/qualification-types", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(qualificationTypesTable)
    .orderBy(asc(qualificationTypesTable.name));
  res.json(rows);
});

// POST /sysadmin/qualification-types
router.post("/sysadmin/qualification-types", async (req, res): Promise<void> => {
  const parsed = QualificationTypeInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(qualificationTypesTable)
    .values({ ...parsed.data })
    .returning();
  res.status(201).json(created);
});

// PATCH /sysadmin/qualification-types/:id
router.patch("/sysadmin/qualification-types/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = QualificationTypeUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(qualificationTypesTable)
    .set(parsed.data)
    .where(eq(qualificationTypesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Qualification type not found" });
    return;
  }
  res.json(updated);
});

// DELETE /sysadmin/qualification-types/:id
router.delete("/sysadmin/qualification-types/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db
    .delete(qualificationTypesTable)
    .where(eq(qualificationTypesTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Qualification type not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
