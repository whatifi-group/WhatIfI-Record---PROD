import { Router, type IRouter } from "express";
import { and, eq, ilike, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import { db, rolesTable, usersTable, userRolesTable } from "@workspace/db";
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
      permissions: usersTable.permissions,
      isSystemAccount: usersTable.isSystemAccount,
      employeeId: usersTable.employeeId,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable);
}

async function attachRoles<T extends { id: number }>(
  rows: T[],
): Promise<(T & { roles: { id: number; name: string }[] })[]> {
  if (rows.length === 0) return [];

  const links = await db
    .select({
      userId: userRolesTable.userId,
      id: rolesTable.id,
      name: rolesTable.name,
    })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(
      inArray(
        userRolesTable.userId,
        rows.map((r) => r.id),
      ),
    );

  const byUser = new Map<number, { id: number; name: string }[]>();
  for (const link of links) {
    byUser.set(link.userId, [
      ...(byUser.get(link.userId) ?? []),
      { id: link.id, name: link.name },
    ]);
  }

  return rows.map((r) => ({ ...r, roles: byUser.get(r.id) ?? [] }));
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
  if (query.data.roleIds) {
    const roleIds = query.data.roleIds
      .split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    if (roleIds.length > 0) {
      conditions.push(
        inArray(
          usersTable.id,
          db
            .select({ id: userRolesTable.userId })
            .from(userRolesTable)
            .where(inArray(userRolesTable.roleId, roleIds)),
        ),
      );
    }
  }

  const rows = await userSelection()
    .where(and(...conditions))
    .orderBy(usersTable.name);

  res.json(ListUsersResponse.parse(await attachRoles(rows)));
});

router.post("/sysadmin/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.toLowerCase();

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const roles = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(inArray(rolesTable.id, parsed.data.roleIds));

  if (roles.length !== new Set(parsed.data.roleIds).size) {
    res.status(400).json({ error: "Role not found" });
    return;
  }

  const { password, email: _email, roleIds, ...rest } = parsed.data;
  const passwordHash = hashPassword(password);

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(usersTable)
      .values({ ...rest, email, passwordHash, isSystemAccount: true, employeeId: null })
      .returning();

    await tx
      .insert(userRolesTable)
      .values(roleIds.map((roleId) => ({ userId: user.id, roleId })));

    return user;
  });

  const [row] = await userSelection().where(eq(usersTable.id, created.id));
  const [withRoles] = await attachRoles([row]);
  res.status(201).json(CreateUserResponse.parse(withRoles));
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

  const [withRoles] = await attachRoles([row]);
  res.json(GetUserResponse.parse(withRoles));
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

  if (parsed.data.roleIds) {
    const roles = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(inArray(rolesTable.id, parsed.data.roleIds));
    if (roles.length !== new Set(parsed.data.roleIds).size) {
      res.status(400).json({ error: "Role not found" });
      return;
    }
  }

  const { roleIds, ...bodyRest } = parsed.data;
  const updates = {
    ...bodyRest,
    ...(parsed.data.email != null ? { email: parsed.data.email.toLowerCase() } : {}),
  };

  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(usersTable.id, params.data.id));

    if (roleIds) {
      await tx.delete(userRolesTable).where(eq(userRolesTable.userId, params.data.id));
      await tx
        .insert(userRolesTable)
        .values(roleIds.map((roleId) => ({ userId: params.data.id, roleId })));
    }
  });

  // Evict stale cached permissions for this user so the next request picks up
  // the new role/permission values immediately without waiting for the TTL.
  invalidatePermissionsCache(params.data.id);

  const [row] = await userSelection().where(eq(usersTable.id, params.data.id));
  const [withRoles] = await attachRoles([row]);
  res.json(UpdateUserResponse.parse(withRoles));
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
