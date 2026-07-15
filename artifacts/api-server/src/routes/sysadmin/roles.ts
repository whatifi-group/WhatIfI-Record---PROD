import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, rolesTable, usersTable } from "@workspace/db";
import { invalidatePermissionsCache } from "../../middlewares/requirePermission";
import {
  CreateRoleBody,
  UpdateRoleBody,
  GetRoleParams,
  UpdateRoleParams,
  DeleteRoleParams,
  ListRolesResponse,
  GetRoleResponse,
  CreateRoleResponse,
  UpdateRoleResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function roleSelection() {
  return db
    .select({
      id: rolesTable.id,
      name: rolesTable.name,
      description: rolesTable.description,
      permissions: rolesTable.permissions,
      isSystem: rolesTable.isSystem,
      userCount: sql<number>`cast(count(${usersTable.id}) as int)`,
      createdAt: rolesTable.createdAt,
    })
    .from(rolesTable)
    .leftJoin(usersTable, eq(usersTable.roleId, rolesTable.id))
    .groupBy(rolesTable.id);
}

router.get("/sysadmin/roles", async (req, res): Promise<void> => {
  const rows = await roleSelection().orderBy(rolesTable.name);
  res.json(ListRolesResponse.parse(rows));
});

router.post("/sysadmin/roles", async (req, res): Promise<void> => {
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.name, parsed.data.name))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Role name already exists" });
    return;
  }

  const [created] = await db
    .insert(rolesTable)
    .values({ ...parsed.data, isSystem: false })
    .returning();

  const [row] = await roleSelection().where(eq(rolesTable.id, created.id));
  res.status(201).json(CreateRoleResponse.parse(row));
});

router.get("/sysadmin/roles/:id", async (req, res): Promise<void> => {
  const params = GetRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await roleSelection().where(eq(rolesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Role not found" });
    return;
  }

  res.json(GetRoleResponse.parse(row));
});

router.patch("/sysadmin/roles/:id", async (req, res): Promise<void> => {
  const params = UpdateRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.id, params.data.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Role not found" });
    return;
  }

  if (existing.isSystem) {
    res.status(409).json({ error: "Cannot modify a system role" });
    return;
  }

  const parsed = UpdateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db
    .update(rolesTable)
    .set(parsed.data)
    .where(eq(rolesTable.id, params.data.id));

  // Evict only cache entries for users who hold this role — avoids a
  // thundering-herd where every user simultaneously re-fetches permissions.
  // Unrelated users' cache entries survive untouched.
  // clearPermissionsCache() remains available as a last-resort escape hatch.
  if (parsed.data.permissions !== undefined) {
    const affected = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.roleId, params.data.id));
    for (const u of affected) {
      invalidatePermissionsCache(u.id);
    }
  }

  const [row] = await roleSelection().where(eq(rolesTable.id, params.data.id));
  res.json(UpdateRoleResponse.parse(row));
});

router.delete("/sysadmin/roles/:id", async (req, res): Promise<void> => {
  const params = DeleteRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.id, params.data.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Role not found" });
    return;
  }

  if (existing.isSystem) {
    res.status(409).json({ error: "Cannot delete a system role" });
    return;
  }

  const usersWithRole = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.roleId, params.data.id))
    .limit(1);

  if (usersWithRole.length > 0) {
    res.status(409).json({ error: "Cannot delete a role that has users assigned" });
    return;
  }

  await db.delete(rolesTable).where(eq(rolesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
