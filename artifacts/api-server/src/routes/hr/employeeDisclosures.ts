import { Router, type IRouter } from "express";
import { and, eq, asc, isNotNull, isNull, sql } from "drizzle-orm";
import {
  db,
  employeeDisclosuresTable,
  employeeDisclosureUpdateChecksTable,
  employeeDisclosureReviewsTable,
  employeesTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod";
import { requirePermission } from "../../middlewares/requirePermission";

const router: IRouter = Router({ mergeParams: true });

// Read access: view_disclosures or sysadmin
const canView = requirePermission(["view_disclosures", "sysadmin"]);
// Write access: edit_employees or sysadmin (manage disclosure records)
const canWrite = requirePermission(["edit_employees", "sysadmin"]);
// Review submit: view_disclosures or sysadmin (HR Managers can submit reviews)
const canSubmitReview = requirePermission(["view_disclosures", "sysadmin"]);
// Sign-off: review_disclosures or sysadmin (Senior Manager only)
const canSignOff = requirePermission(["review_disclosures", "sysadmin"]);

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const DisclosureParam = z.object({
  id: z.coerce.number().int().positive(),
  disclosureId: z.coerce.number().int().positive(),
});
const CheckParam = z.object({
  id: z.coerce.number().int().positive(),
  disclosureId: z.coerce.number().int().positive(),
  checkId: z.coerce.number().int().positive(),
});

const DisclosureInput = z.object({
  checkType: z.enum(["dbs", "pvg", "access_ni"]),
  checkLevel: z.enum(["basic", "standard", "enhanced", "enhanced_barred"]),
  certificateNumber: z.string().optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  onUpdateService: z.boolean(),
  convictionDetails: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const DisclosureUpdate = z.object({
  checkType: z.enum(["dbs", "pvg", "access_ni"]).optional(),
  checkLevel: z
    .enum(["basic", "standard", "enhanced", "enhanced_barred"])
    .optional(),
  certificateNumber: z.string().optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  onUpdateService: z.boolean().optional(),
  convictionDetails: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const UpdateCheckInput = z.object({
  checkedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  result: z.enum(["clear", "not_clear", "changes_shown"]),
  checkedBy: z.string().min(1),
  notes: z.string().optional().nullable(),
});

const ReviewInput = z.object({
  recommendation: z.enum(["approved", "not_approved", "further_review"]),
  reviewerNotes: z.string().optional().nullable(),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Verify that disclosureId belongs to the given employeeId. */
async function requireDisclosureOwnership(
  employeeId: number,
  disclosureId: number,
): Promise<{ id: number } | null> {
  const [row] = await db
    .select({ id: employeeDisclosuresTable.id })
    .from(employeeDisclosuresTable)
    .where(
      and(
        eq(employeeDisclosuresTable.id, disclosureId),
        eq(employeeDisclosuresTable.employeeId, employeeId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Fetch a disclosure with its nested update checks and review. */
async function fetchDisclosureWithNested(disclosureId: number) {
  const [disclosure] = await db
    .select()
    .from(employeeDisclosuresTable)
    .where(eq(employeeDisclosuresTable.id, disclosureId))
    .limit(1);

  if (!disclosure) return null;

  const updateChecks = await db
    .select()
    .from(employeeDisclosureUpdateChecksTable)
    .where(
      eq(employeeDisclosureUpdateChecksTable.disclosureId, disclosureId),
    )
    .orderBy(asc(employeeDisclosureUpdateChecksTable.checkedDate));

  const [review] = await db
    .select({
      id: employeeDisclosureReviewsTable.id,
      disclosureId: employeeDisclosureReviewsTable.disclosureId,
      recommendation: employeeDisclosureReviewsTable.recommendation,
      reviewerNotes: employeeDisclosureReviewsTable.reviewerNotes,
      reviewDate: employeeDisclosureReviewsTable.reviewDate,
      signedOffByUserId: employeeDisclosureReviewsTable.signedOffByUserId,
      signedOffAt: employeeDisclosureReviewsTable.signedOffAt,
      createdAt: employeeDisclosureReviewsTable.createdAt,
      signedOffByName: usersTable.name,
    })
    .from(employeeDisclosureReviewsTable)
    .leftJoin(
      usersTable,
      eq(
        employeeDisclosureReviewsTable.signedOffByUserId,
        usersTable.id,
      ),
    )
    .where(
      eq(employeeDisclosureReviewsTable.disclosureId, disclosureId),
    )
    .limit(1);

  return {
    ...disclosure,
    updateChecks,
    review: review ?? null,
  };
}

// ---------------------------------------------------------------------------
// GET /employees/:id/disclosures — read: view_disclosures
// ---------------------------------------------------------------------------
router.get(
  "/employees/:id/disclosures",
  canView,
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const disclosures = await db
      .select()
      .from(employeeDisclosuresTable)
      .where(eq(employeeDisclosuresTable.employeeId, params.data.id))
      .orderBy(asc(employeeDisclosuresTable.issueDate));

    // Attach nested update checks and review to each disclosure
    const results = await Promise.all(
      disclosures.map((d) => fetchDisclosureWithNested(d.id)),
    );

    res.json(results.filter(Boolean));
  },
);

// ---------------------------------------------------------------------------
// POST /employees/:id/disclosures — write: edit_employees
// ---------------------------------------------------------------------------
router.post(
  "/employees/:id/disclosures",
  canWrite,
  async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = DisclosureInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [created] = await db
      .insert(employeeDisclosuresTable)
      .values({
        employeeId: params.data.id,
        checkType: parsed.data.checkType,
        checkLevel: parsed.data.checkLevel,
        certificateNumber: parsed.data.certificateNumber ?? null,
        issueDate: parsed.data.issueDate,
        onUpdateService: parsed.data.onUpdateService,
        convictionDetails: parsed.data.convictionDetails ?? null,
        notes: parsed.data.notes ?? null,
      })
      .returning();

    const result = await fetchDisclosureWithNested(created.id);
    res.status(201).json(result);
  },
);

// ---------------------------------------------------------------------------
// PATCH /employees/:id/disclosures/:disclosureId — write: edit_employees
// ---------------------------------------------------------------------------
router.patch(
  "/employees/:id/disclosures/:disclosureId",
  canWrite,
  async (req, res): Promise<void> => {
    const params = DisclosureParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = DisclosureUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const existing = await requireDisclosureOwnership(
      params.data.id,
      params.data.disclosureId,
    );
    if (!existing) {
      res.status(404).json({ error: "Disclosure not found" });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.checkType !== undefined)
      updateData.checkType = parsed.data.checkType;
    if (parsed.data.checkLevel !== undefined)
      updateData.checkLevel = parsed.data.checkLevel;
    if (parsed.data.certificateNumber !== undefined)
      updateData.certificateNumber = parsed.data.certificateNumber;
    if (parsed.data.issueDate !== undefined)
      updateData.issueDate = parsed.data.issueDate;
    if (parsed.data.onUpdateService !== undefined)
      updateData.onUpdateService = parsed.data.onUpdateService;
    if (parsed.data.convictionDetails !== undefined)
      updateData.convictionDetails = parsed.data.convictionDetails;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
    updateData.updatedAt = new Date();

    await db
      .update(employeeDisclosuresTable)
      .set(updateData)
      .where(eq(employeeDisclosuresTable.id, params.data.disclosureId));

    const result = await fetchDisclosureWithNested(params.data.disclosureId);
    res.json(result);
  },
);

// ---------------------------------------------------------------------------
// DELETE /employees/:id/disclosures/:disclosureId — write: edit_employees
// ---------------------------------------------------------------------------
router.delete(
  "/employees/:id/disclosures/:disclosureId",
  canWrite,
  async (req, res): Promise<void> => {
    const params = DisclosureParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [deleted] = await db
      .delete(employeeDisclosuresTable)
      .where(
        and(
          eq(employeeDisclosuresTable.id, params.data.disclosureId),
          eq(employeeDisclosuresTable.employeeId, params.data.id),
        ),
      )
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Disclosure not found" });
      return;
    }

    res.sendStatus(204);
  },
);

// ---------------------------------------------------------------------------
// GET /employees/:id/disclosures/:disclosureId/update-checks — read: view_disclosures
// ---------------------------------------------------------------------------
router.get(
  "/employees/:id/disclosures/:disclosureId/update-checks",
  canView,
  async (req, res): Promise<void> => {
    const params = DisclosureParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const disclosure = await requireDisclosureOwnership(
      params.data.id,
      params.data.disclosureId,
    );
    if (!disclosure) {
      res.status(404).json({ error: "Disclosure not found" });
      return;
    }

    const rows = await db
      .select()
      .from(employeeDisclosureUpdateChecksTable)
      .where(
        eq(
          employeeDisclosureUpdateChecksTable.disclosureId,
          params.data.disclosureId,
        ),
      )
      .orderBy(asc(employeeDisclosureUpdateChecksTable.checkedDate));

    res.json(rows);
  },
);

// ---------------------------------------------------------------------------
// POST /employees/:id/disclosures/:disclosureId/update-checks — write: edit_employees
// ---------------------------------------------------------------------------
router.post(
  "/employees/:id/disclosures/:disclosureId/update-checks",
  canWrite,
  async (req, res): Promise<void> => {
    const params = DisclosureParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const disclosure = await requireDisclosureOwnership(
      params.data.id,
      params.data.disclosureId,
    );
    if (!disclosure) {
      res.status(404).json({ error: "Disclosure not found" });
      return;
    }

    const parsed = UpdateCheckInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [created] = await db
      .insert(employeeDisclosureUpdateChecksTable)
      .values({
        disclosureId: params.data.disclosureId,
        checkedDate: parsed.data.checkedDate,
        result: parsed.data.result,
        checkedBy: parsed.data.checkedBy,
        notes: parsed.data.notes ?? null,
      })
      .returning();

    res.status(201).json(created);
  },
);

// ---------------------------------------------------------------------------
// DELETE /employees/:id/disclosures/:disclosureId/update-checks/:checkId — write: edit_employees
// ---------------------------------------------------------------------------
router.delete(
  "/employees/:id/disclosures/:disclosureId/update-checks/:checkId",
  canWrite,
  async (req, res): Promise<void> => {
    const params = CheckParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const disclosure = await requireDisclosureOwnership(
      params.data.id,
      params.data.disclosureId,
    );
    if (!disclosure) {
      res.status(404).json({ error: "Disclosure not found" });
      return;
    }

    const [deleted] = await db
      .delete(employeeDisclosureUpdateChecksTable)
      .where(
        and(
          eq(employeeDisclosureUpdateChecksTable.id, params.data.checkId),
          eq(
            employeeDisclosureUpdateChecksTable.disclosureId,
            params.data.disclosureId,
          ),
        ),
      )
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Check result not found" });
      return;
    }

    res.sendStatus(204);
  },
);

// ---------------------------------------------------------------------------
// POST /employees/:id/disclosures/:disclosureId/review — view_disclosures (HR Managers can submit)
// ---------------------------------------------------------------------------
router.post(
  "/employees/:id/disclosures/:disclosureId/review",
  canSubmitReview,
  async (req, res): Promise<void> => {
    const params = DisclosureParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const disclosure = await requireDisclosureOwnership(
      params.data.id,
      params.data.disclosureId,
    );
    if (!disclosure) {
      res.status(404).json({ error: "Disclosure not found" });
      return;
    }

    const parsed = ReviewInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Check for existing review — if already signed off, reject updates
    const [existing] = await db
      .select()
      .from(employeeDisclosureReviewsTable)
      .where(
        eq(
          employeeDisclosureReviewsTable.disclosureId,
          params.data.disclosureId,
        ),
      )
      .limit(1);

    if (existing?.signedOffAt) {
      res
        .status(409)
        .json({ error: "Review has already been signed off and cannot be modified" });
      return;
    }

    let reviewId: number;
    if (existing) {
      // Update existing review
      const [updated] = await db
        .update(employeeDisclosureReviewsTable)
        .set({
          recommendation: parsed.data.recommendation,
          reviewerNotes: parsed.data.reviewerNotes ?? null,
          reviewDate: parsed.data.reviewDate,
        })
        .where(eq(employeeDisclosureReviewsTable.id, existing.id))
        .returning({ id: employeeDisclosureReviewsTable.id });
      reviewId = updated.id;
    } else {
      // Create new review
      const [created] = await db
        .insert(employeeDisclosureReviewsTable)
        .values({
          disclosureId: params.data.disclosureId,
          recommendation: parsed.data.recommendation,
          reviewerNotes: parsed.data.reviewerNotes ?? null,
          reviewDate: parsed.data.reviewDate,
        })
        .returning({ id: employeeDisclosureReviewsTable.id });
      reviewId = created.id;
    }

    const [review] = await db
      .select({
        id: employeeDisclosureReviewsTable.id,
        disclosureId: employeeDisclosureReviewsTable.disclosureId,
        recommendation: employeeDisclosureReviewsTable.recommendation,
        reviewerNotes: employeeDisclosureReviewsTable.reviewerNotes,
        reviewDate: employeeDisclosureReviewsTable.reviewDate,
        signedOffByUserId: employeeDisclosureReviewsTable.signedOffByUserId,
        signedOffAt: employeeDisclosureReviewsTable.signedOffAt,
        createdAt: employeeDisclosureReviewsTable.createdAt,
        signedOffByName: usersTable.name,
      })
      .from(employeeDisclosureReviewsTable)
      .leftJoin(
        usersTable,
        eq(employeeDisclosureReviewsTable.signedOffByUserId, usersTable.id),
      )
      .where(eq(employeeDisclosureReviewsTable.id, reviewId))
      .limit(1);

    res.json(review);
  },
);

// ---------------------------------------------------------------------------
// GET /disclosures/pending-reviews — review_disclosures or sysadmin
// Returns disclosures with conviction details that have no signed-off review.
// ---------------------------------------------------------------------------
router.get(
  "/disclosures/pending-reviews",
  canSignOff,
  async (_req, res): Promise<void> => {
    // Find all disclosures with conviction details where no signed-off review exists.
    // Left-join reviews so we can filter on signedOffAt being null.
    const rows = await db
      .select({
        disclosureId: employeeDisclosuresTable.id,
        employeeId: employeeDisclosuresTable.employeeId,
        employeeFirstName: employeesTable.firstName,
        employeeLastName: employeesTable.lastName,
        checkType: employeeDisclosuresTable.checkType,
        daysPending: sql<number>`(CURRENT_DATE - ${employeeDisclosuresTable.createdAt}::date)::integer`,
      })
      .from(employeeDisclosuresTable)
      .innerJoin(employeesTable, eq(employeeDisclosuresTable.employeeId, employeesTable.id))
      .leftJoin(
        employeeDisclosureReviewsTable,
        eq(employeeDisclosureReviewsTable.disclosureId, employeeDisclosuresTable.id),
      )
      .where(
        and(
          isNotNull(employeeDisclosuresTable.convictionDetails),
          isNull(employeeDisclosureReviewsTable.signedOffAt),
        ),
      )
      .orderBy(asc(employeeDisclosuresTable.createdAt));

    res.json(rows);
  },
);

// ---------------------------------------------------------------------------
// POST /employees/:id/disclosures/:disclosureId/review/sign-off
// ---------------------------------------------------------------------------
router.post(
  "/employees/:id/disclosures/:disclosureId/review/sign-off",
  canSignOff,
  async (req, res): Promise<void> => {
    const params = DisclosureParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    // Verify the disclosure belongs to the employee in the path
    const disclosureOwner = await requireDisclosureOwnership(
      params.data.id,
      params.data.disclosureId,
    );
    if (!disclosureOwner) {
      res.status(404).json({ error: "Disclosure not found" });
      return;
    }

    const [review] = await db
      .select()
      .from(employeeDisclosureReviewsTable)
      .where(
        eq(
          employeeDisclosureReviewsTable.disclosureId,
          params.data.disclosureId,
        ),
      )
      .limit(1);

    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    if (review.signedOffAt) {
      res.status(409).json({ error: "Review has already been signed off" });
      return;
    }

    await db
      .update(employeeDisclosureReviewsTable)
      .set({
        signedOffByUserId: userId,
        signedOffAt: new Date(),
      })
      .where(eq(employeeDisclosureReviewsTable.id, review.id));

    const [updated] = await db
      .select({
        id: employeeDisclosureReviewsTable.id,
        disclosureId: employeeDisclosureReviewsTable.disclosureId,
        recommendation: employeeDisclosureReviewsTable.recommendation,
        reviewerNotes: employeeDisclosureReviewsTable.reviewerNotes,
        reviewDate: employeeDisclosureReviewsTable.reviewDate,
        signedOffByUserId: employeeDisclosureReviewsTable.signedOffByUserId,
        signedOffAt: employeeDisclosureReviewsTable.signedOffAt,
        createdAt: employeeDisclosureReviewsTable.createdAt,
        signedOffByName: usersTable.name,
      })
      .from(employeeDisclosureReviewsTable)
      .leftJoin(
        usersTable,
        eq(employeeDisclosureReviewsTable.signedOffByUserId, usersTable.id),
      )
      .where(eq(employeeDisclosureReviewsTable.id, review.id))
      .limit(1);

    res.json(updated);
  },
);

export default router;
