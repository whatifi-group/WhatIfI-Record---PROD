import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, employeesTable, rolesTable, usersTable } from "@workspace/db";
import { verifyPassword } from "../lib/password";
import { LoginBody } from "@workspace/api-zod";

const router: IRouter = Router();

function userRow(row: {
  id: number;
  name: string;
  email: string;
  status: string;
  roleId: number;
  roleName: string | null;
  rolePermissions: unknown;
  userPermissions: unknown;
  isSystemAccount: boolean;
  employeeId: number | null;
  employee: { id: number; firstName: string; lastName: string; status: string } | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  const rolePerms = Array.isArray(row.rolePermissions) ? row.rolePermissions : [];
  const userPerms = Array.isArray(row.userPermissions) ? row.userPermissions : [];
  const effectivePermissions = [...new Set([...rolePerms, ...userPerms])];

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    roleId: row.roleId,
    roleName: row.roleName ?? "",
    permissions: effectivePermissions,
    isSystemAccount: row.isSystemAccount,
    employeeId: row.employeeId,
    employee: row.employee,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

async function fetchUser(id: number) {
  const [row] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      status: usersTable.status,
      roleId: usersTable.roleId,
      roleName: rolesTable.name,
      rolePermissions: rolesTable.permissions,
      userPermissions: usersTable.permissions,
      isSystemAccount: usersTable.isSystemAccount,
      employeeId: usersTable.employeeId,
      employeeRecordId: employeesTable.id,
      employeeFirstName: employeesTable.firstName,
      employeeLastName: employeesTable.lastName,
      employeeStatus: employeesTable.status,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .leftJoin(employeesTable, eq(usersTable.employeeId, employeesTable.id))
    .where(eq(usersTable.id, id));

  if (!row) return null;

  return {
    ...row,
    employee:
      row.employeeRecordId != null
        ? {
            id: row.employeeRecordId,
            firstName: row.employeeFirstName!,
            lastName: row.employeeLastName!,
            status: row.employeeStatus!,
          }
        : null,
  };
}

// POST /api/auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email.toLowerCase()))
    .limit(1);

  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.status !== "active") {
    res.status(401).json({ error: "Account is not active" });
    return;
  }

  // Update last login timestamp
  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  req.session.userId = user.id;

  const row = await fetchUser(user.id);
  res.json(userRow(row!));
});

// POST /api/auth/logout
router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.sendStatus(204);
  });
});

// GET /api/auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const row = await fetchUser(req.session.userId);
  if (!row) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "User no longer exists" });
    return;
  }

  if (row.status !== "active") {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Account is not active" });
    return;
  }

  res.json(userRow(row));
});

export default router;
