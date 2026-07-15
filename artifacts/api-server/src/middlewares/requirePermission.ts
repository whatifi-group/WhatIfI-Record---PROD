import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import { db, rolesTable, usersTable } from "@workspace/db";

// ---------------------------------------------------------------------------
// In-process permissions cache
// ---------------------------------------------------------------------------
// Keyed on userId (number).  Each entry is a Set<string> of effective
// permissions and lives for 60 seconds.  This avoids a DB round-trip on every
// authenticated request once permissions have been fetched once.
//
// Invalidation helpers are exported so that routes which mutate a user's role
// or permissions can evict stale entries immediately rather than waiting for
// the TTL to expire.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000; // 60 seconds

const permissionsCache = new LRUCache<number, Set<string>>({
  max: 1_000,        // at most 1 000 users cached at once
  ttl: CACHE_TTL_MS,
});

/**
 * Evict the cached permissions for a single user.
 * Call this whenever a user's roleId or user-level permissions are changed.
 */
export function invalidatePermissionsCache(userId: number): void {
  permissionsCache.delete(userId);
}

/**
 * Evict ALL cached permission entries.
 * Use this when a role's permissions change, because any number of users may
 * hold that role and individual eviction would require a DB lookup to find them.
 */
export function clearPermissionsCache(): void {
  permissionsCache.clear();
}

// ---------------------------------------------------------------------------
// Core helper
// ---------------------------------------------------------------------------

/**
 * Returns the full set of effective permissions (role + user-level overrides)
 * for the given userId.  Returns an empty Set when the user is not found.
 *
 * Results are cached in-process for CACHE_TTL_MS (60 s).  Call
 * `invalidatePermissionsCache(userId)` or `clearPermissionsCache()` after
 * mutating user or role data so the next request sees fresh values.
 *
 * Shared by `requirePermission` and by route handlers that need to
 * conditionally filter sensitive response fields (e.g. salary).
 */
export async function getEffectivePermissions(
  userId: number,
): Promise<Set<string>> {
  const cached = permissionsCache.get(userId);
  if (cached !== undefined) {
    return cached;
  }

  const [row] = await db
    .select({
      rolePermissions: rolesTable.permissions,
      userPermissions: usersTable.permissions,
    })
    .from(usersTable)
    .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!row) {
    // Cache the empty result too so a missing user doesn't hammer the DB.
    const empty = new Set<string>();
    permissionsCache.set(userId, empty);
    return empty;
  }

  const rolePerms = Array.isArray(row.rolePermissions)
    ? (row.rolePermissions as string[])
    : [];
  const userPerms = Array.isArray(row.userPermissions)
    ? (row.userPermissions as string[])
    : [];
  const effective = new Set([...rolePerms, ...userPerms]);
  permissionsCache.set(userId, effective);
  return effective;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

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

    // Use the per-request cache set by requireAuth; fall back to a fresh DB
    // call only when the cache is absent (e.g. in unit tests that mount the
    // router without the full middleware stack).
    const effective =
      req.effectivePermissions ?? (await getEffectivePermissions(userId));

    if (!required.some((p) => effective.has(p))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}
