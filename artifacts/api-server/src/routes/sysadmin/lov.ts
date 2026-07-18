import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, lovItemsTable, employeePayRatesTable } from "@workspace/db";
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
  leaver_reason: "Leaver Reasons",
};

// "system_config" holds internal single-value settings (e.g. the onboarding
// passphrase in routes/onboarding.ts) — it reuses the lov_items table as
// storage but is not a real list-of-values category, and must never be
// editable through this generic list-management API. Without this guard, a
// sysadmin browsing "Manage Lists" can toggle the passphrase row inactive
// (or delete it outright) with no indication it isn't an ordinary dropdown
// value — this has happened in production.
const MANAGED_CATEGORY_BLOCKLIST = new Set(["system_config"]);

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
    if (MANAGED_CATEGORY_BLOCKLIST.has(row.category)) continue;
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
  if (MANAGED_CATEGORY_BLOCKLIST.has(category)) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
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
  if (MANAGED_CATEGORY_BLOCKLIST.has(category)) {
    res.status(403).json({ error: "This category cannot be managed here." });
    return;
  }

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

  if (MANAGED_CATEGORY_BLOCKLIST.has(params.data.category)) {
    res.status(403).json({ error: "This category cannot be managed here." });
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

  // When a shift_type LOV entry is deactivated, close every open pay rate that
  // references its value by setting effective_to = today.  This prevents
  // orphaned "active" pay rates for a shift type that no longer exists.
  if (params.data.category === "shift_type" && parsed.data.isActive === false) {
    const today = new Date().toISOString().split("T")[0];
    await db
      .update(employeePayRatesTable)
      .set({ effectiveTo: today })
      .where(
        and(
          eq(employeePayRatesTable.shiftType, existing[0].value),
          isNull(employeePayRatesTable.effectiveTo),
        ),
      );
  }

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

  if (MANAGED_CATEGORY_BLOCKLIST.has(category)) {
    res.status(403).json({ error: "This category cannot be managed here." });
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
