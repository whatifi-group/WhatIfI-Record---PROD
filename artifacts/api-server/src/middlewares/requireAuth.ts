import type { Request, Response, NextFunction } from "express";
import { getEffectivePermissions } from "./requirePermission";

// Routes that don't require authentication.
// These are matched against req.path which is relative to the /api mount point.
const PUBLIC_PATHS = new Set([
  "/auth/login",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/healthz",
  // Onboarding public endpoints — JWT-gated internally, not session-gated
  "/onboarding/verify",
  "/onboarding/submit",
]);

// Prefixes for routes with a dynamic path segment that don't require
// authentication — the local object storage upload/download endpoints are
// authenticated by an HMAC-signed, time-limited token in the URL itself
// (see lib/objectStorage.ts), the same trust model as a GCS presigned URL.
const PUBLIC_PATH_PREFIXES = [
  "/storage/local-upload/",
  "/storage/local-download/",
];

/**
 * Authentication guard + per-request permission cache.
 *
 * For authenticated requests this middleware:
 *  1. Rejects unauthenticated callers with 401.
 *  2. Fetches the user's effective permissions (role + user-level overrides)
 *     from the DB **once** and attaches them to `req.effectivePermissions`.
 *
 * Downstream `requirePermission` guards and route handlers read
 * `req.effectivePermissions` directly, eliminating redundant DB lookups on
 * the same request.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (
    PUBLIC_PATHS.has(req.path) ||
    PUBLIC_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix))
  ) {
    next();
    return;
  }

  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Resolve permissions once per request and cache on req.
  req.effectivePermissions = await getEffectivePermissions(req.session.userId);

  next();
}
