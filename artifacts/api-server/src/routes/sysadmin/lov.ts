import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, lovItemsTable } from "@workspace/db";
import {
  CreateLovItemBody,
  UpdateLovItemBody,
  UpdateLovItemParams,
  DeleteLovItemParams,
  ListLovCategoriesResponse,
  ListLovItemsResponse,
  CreateLovItemResponse,
  UpdateLovItemResponse,
} from "@workspace/api-zod";
const router: IRouter = Router();

// Human-readable labels for each category slug
const CATEGORY_LABELS: Record<string, string> = {
  employment_type: "Employment Types",
  leave_type: "Leave Types",
  employee_status: "Employee Status",
  address_type: "Address Types",
  shift_type: "Shift Types",
  medical_condition: "Medical Conditions",
  dietary_requirement: "Dietary Requirements",
};

// GET /sysadmin/lov — all categories with their items
router.get("/sysadmin/lov", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(lovItemsTable)
    .orderBy(lovItemsTable.category, lovItemsTable.sortOrder, lovItemsTable.label);

  // Group by category — seed all known categories first so empty ones still appear
  const grouped = new Map<string, typeof rows>();
  for (const cat of Object.keys(CATEGORY_LABELS)) grouped.set(cat, []);
  for (const row of rows) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category)!.push(row);
  }

  const categories = Array.from(grouped.entries()).map(([cat, items]) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    items,
  }));

  res.json(ListLovCategoriesResponse.parse(categories));
});

// GET /sysadmin/lov/:category — items for one category
router.get("/sysadmin/lov/:category", async (req, res): Promise<void> => {
  const { category } = req.params;
  const rows = await db
    .select()
    .from(lovItemsTable)
    .where(eq(lovItemsTable.category, category))
    .orderBy(lovItemsTable.sortOrder, lovItemsTable.label);

  res.json(ListLovItemsResponse.parse(rows));
});

// POST /sysadmin/lov/:category — create item
router.post("/sysadmin/lov/:category", async (req, res): Promise<void> => {
  const { category } = req.params;

  const parsed = CreateLovItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Auto-generate slug from label: lowercase, runs of non-alphanumeric → "_", trim underscores
  const baseSlug = parsed.data.label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!baseSlug) {
    res.status(400).json({ error: "Label must contain at least one letter or number." });
    return;
  }

  // Find a unique slug by appending _2, _3, … if needed
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const conflict = await db
      .select({ id: lovItemsTable.id })
      .from(lovItemsTable)
      .where(and(eq(lovItemsTable.category, category), eq(lovItemsTable.value, slug)))
      .limit(1);
    if (conflict.length === 0) break;
    slug = `${baseSlug}_${suffix++}`;
  }

  const [created] = await db
    .insert(lovItemsTable)
    .values({ ...parsed.data, value: slug, category, isSystem: false })
    .returning();

  res.status(201).json(CreateLovItemResponse.parse(created));
});

// PATCH /sysadmin/lov/:category/:id — update item
router.patch("/sysadmin/lov/:category/:id", async (req, res): Promise<void> => {
  const params = UpdateLovItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(lovItemsTable)
    .where(
      and(
        eq(lovItemsTable.id, params.data.id),
        eq(lovItemsTable.category, params.data.category),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const parsed = UpdateLovItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(lovItemsTable)
    .set(parsed.data)
    .where(eq(lovItemsTable.id, params.data.id))
    .returning();

  res.json(UpdateLovItemResponse.parse(updated));
});

// DELETE /sysadmin/lov/:category/:id — delete non-system item
router.delete("/sysadmin/lov/:category/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id, 10);
  const { category } = req.params;

  if (isNaN(idNum)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(lovItemsTable)
    .where(
      and(eq(lovItemsTable.id, idNum), eq(lovItemsTable.category, category)),
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  await db.delete(lovItemsTable).where(eq(lovItemsTable.id, idNum));
  res.sendStatus(204);
});

export default router;
