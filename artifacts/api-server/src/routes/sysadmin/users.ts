import { Router, type IRouter } from "express";
import { and, eq, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db, employeesTable, rolesTable, usersTable } from "@workspace/db";
import { hashPassword } from "../../lib/password";
import {
  invalidatePermissionsCache,
} from "../../middlewares/requirePermission";
import {
  CreateUserBody,
  UpdateUserBody,
  GetUserParams,
  UpdateUserParams,
  DeleteUserParams,
  ListUsersQueryParams,
  ListUsersResponse,
  GetUserResponse,
  CreateUserResponse,
  UpdateUserResponse,
  ResetUserPasswordBody,
  ResetUserPasswordParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function userSelection() {
  return db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      status: usersTable.status,
      roleId: usersTable.roleId,
      roleName: rolesTable.name,
      permissions: usersTable.permissions,
      isSystemAccount: usersTable.isSystemAccount,
      employeeId: usersTable.employeeId,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id));
}

router.get("/sysadmin/users", async (req, res): Promise<void> => {
  const query = ListUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];

  // Exclude suspended leaver-linked accounts (they belong to ex-employees and
  // clutter the sysadmin view). System accounts always appear regardless of status.
  conditions.push(
    or(
      eq(usersTable.isSystemAccount, true),
      isNull(usersTable.employeeId),
      ne(usersTable.status, "suspended"),
    )!,
  );

  if (query.data.search) {
    const term = `%${query.data.search}%`;
    conditions.push(
      or(
        ilike(usersTable.name, term),
        ilike(usersTable.email, term),
      )!,
    );
  }
  if (query.data.status) {
    conditions.push(eq(usersTable.status, query.data.status));
  }
  if (query.data.roleId != null) {
    conditions.push(eq(usersTable.roleId, query.data.roleId));
  }

  const rows = await userSelection()
    .where(and(...conditions))
    .orderBy(usersTable.name);

  res.json(ListUsersResponse.parse(rows));
});

router.post("/sysadmin/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const role = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.id, parsed.data.roleId))
    .limit(1);

  if (role.length === 0) {
    res.status(400).json({ error: "Role not found" });
    return;
  }

  const { password, ...rest } = parsed.data;
  const passwordHash = hashPassword(password);

  const [created] = await db
    .insert(usersTable)
    .values({ ...rest, passwordHash, isSystemAccount: true, employeeId: null })
    .returning();

  const [row] = await userSelection().where(eq(usersTable.id, created.id));
  res.status(201).json(CreateUserResponse.parse(row));
});

router.get("/sysadmin/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await userSelection().where(eq(usersTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetUserResponse.parse(row));
});

router.patch("/sysadmin/users/:id", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.roleId) {
    const role = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.id, parsed.data.roleId))
      .limit(1);
    if (role.length === 0) {
      res.status(400).json({ error: "Role not found" });
      return;
    }
  }

  await db
    .update(usersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(usersTable.id, params.data.id));

  // Evict stale cached permissions for this user so the next request picks up
  // the new role/permission values immediately without waiting for the TTL.
  invalidatePermissionsCache(params.data.id);

  const [row] = await userSelection().where(eq(usersTable.id, params.data.id));
  res.json(UpdateUserResponse.parse(row));
});

router.post("/sysadmin/users/:id/reset-password", async (req, res): Promise<void> => {
  const params = ResetUserPasswordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ResetUserPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const passwordHash = hashPassword(parsed.data.password);

  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, params.data.id));

  // Invalidate session cache so the user is forced to re-authenticate with
  // the new password on their next request.
  invalidatePermissionsCache(params.data.id);

  res.sendStatus(204);
});

router.delete("/sysadmin/users/:id", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Evict stale cached permissions so a deleted user cannot retain access for
  // up to 60 s on a still-active session.
  invalidatePermissionsCache(params.data.id);

  res.sendStatus(204);
});

export default router;
