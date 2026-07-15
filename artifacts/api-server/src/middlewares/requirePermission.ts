import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, rolesTable, usersTable } from "@workspace/db";

/**
 * Returns the full set of effective permissions (role + user-level overrides)
 * for the given userId.  Returns an empty Set when the user is not found.
 *
 * Shared by `requirePermission` and by route handlers that need to
 * conditionally filter sensitive response fields (e.g. salary).
 */
export async function getEffectivePermissions(
  userId: number,
): Promise<Set<string>> {
  const [row] = await db
    .select({
      rolePermissions: rolesTable.permissions,
      userPermissions: usersTable.permissions,
    })
    .from(usersTable)
    .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!row) return new Set();

  const rolePerms = Array.isArray(row.rolePermissions)
    ? (row.rolePermissions as string[])
    : [];
  const userPerms = Array.isArray(row.userPermissions)
    ? (row.userPermissions as string[])
    : [];
  return new Set([...rolePerms, ...userPerms]);
}

/**
 * Middleware factory that returns a 403 if the authenticated user does not
 * hold at least one of the specified permissions (checked against their
 * effective permissions: role permissions merged with user-level overrides).
 *
 * Must be used after `requireAuth` so `req.session.userId` is guaranteed.
 */
export function requirePermission(permission: string | string[]) {
  const required = Array.isArray(permission) ? permission : [permission];
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const effective = await getEffectivePermissions(userId);

    if (!required.some((p) => effective.has(p))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}
