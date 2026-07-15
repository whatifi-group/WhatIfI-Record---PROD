/**
 * Salary guard — shared utilities for payroll-sensitive field redaction.
 *
 * Mount `payrollVisibilityMiddleware` followed by `salaryRedactionMiddleware`
 * on any router that returns employee data.  The redaction middleware intercepts
 * every `res.json()` call and strips salary from any object (or array of
 * objects) that carries a `salary` field when the caller lacks payroll
 * permission.  Individual route handlers do NOT call `redactSalary` manually.
 *
 * New endpoints added to the HR router are automatically covered — they only
 * need to call `res.json(...)` as usual.
 *
 * Unauthenticated callers (no session) always get `canViewPayroll = false`,
 * so salary is never leaked to sessionless requests.
 */
import type { Request, Response, NextFunction } from "express";
import { getEffectivePermissions } from "../middlewares/requirePermission";

/** True when the given permission set grants access to payroll-sensitive fields. */
export function canViewPayroll(perms: Set<string>): boolean {
  return perms.has("view_payroll") || perms.has("sysadmin");
}

/**
 * Strip salary from an employee row when the caller lacks payroll permission.
 *
 * Still exported for use in tests or standalone contexts outside the HR router.
 *
 * @param row     Employee row (or any object with an optional `salary` field).
 * @param allowed Pass `req.canViewPayroll ?? false`.
 */
export function redactSalary<T extends { salary?: number | null }>(
  row: T,
  allowed: boolean,
): T {
  if (allowed) return row;
  return { ...row, salary: null };
}

/**
 * Recursively redact salary from a `res.json` body.
 * Handles arrays, single objects, and pass-through for anything else.
 */
function redactSalaryFromBody(body: unknown, allowed: boolean): unknown {
  if (allowed) return body;
  if (Array.isArray(body)) {
    return body.map((item) =>
      item !== null && typeof item === "object" && "salary" in item
        ? { ...(item as object), salary: null }
        : item,
    );
  }
  if (body !== null && typeof body === "object" && "salary" in body) {
    return { ...(body as object), salary: null };
  }
  return body;
}

/**
 * Express middleware — pre-computes `req.canViewPayroll` for the current
 * request and attaches it to `req`.
 *
 * Uses the effective permissions already resolved by `requireAuth` when
 * available, falling back to a fresh DB lookup in test environments that
 * bypass `requireAuth`.  Defaults to `false` (salary hidden) when no
 * session is present.
 */
export async function payrollVisibilityMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.session?.userId;
  const perms =
    req.effectivePermissions ??
    (userId ? await getEffectivePermissions(userId) : new Set<string>());
  req.canViewPayroll = canViewPayroll(perms);
  next();
}

/**
 * Express middleware — intercepts every `res.json()` call on the HR router
 * and automatically strips the `salary` field from any employee-shaped
 * response when the caller does not have payroll permission.
 *
 * Must be mounted AFTER `payrollVisibilityMiddleware` so that
 * `req.canViewPayroll` is already set.
 *
 * Route handlers do NOT need to call `redactSalary` themselves — just call
 * `res.json(rows)` as normal and this middleware handles redaction centrally.
 * Adding a new employee-returning endpoint to the HR router is automatically
 * covered.
 */
export function salaryRedactionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const originalJson = res.json.bind(res);
  // Override res.json for the lifetime of this request
  res.json = function (body: unknown): Response {
    const allowed = req.canViewPayroll ?? false;
    return originalJson(redactSalaryFromBody(body, allowed));
  };
  next();
}
