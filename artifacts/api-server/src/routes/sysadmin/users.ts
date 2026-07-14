import { Router, type IRouter } from "express";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import crypto from "node:crypto";
import { db, rolesTable, usersTable } from "@workspace/db";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

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

  const base = userSelection();
  const rows = await (conditions.length > 0
    ? base.where(and(...conditions))
    : base
  ).orderBy(usersTable.name);

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
    .values({ ...rest, passwordHash })
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

  const [row] = await userSelection().where(eq(usersTable.id, params.data.id));
  res.json(UpdateUserResponse.parse(row));
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

  res.sendStatus(204);
});

export default router;
