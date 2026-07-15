/**
 * Salary guard — shared utilities for payroll-sensitive field redaction.
 *
 * Mount `payrollVisibilityMiddleware` on any router that returns employee data.
 * Route handlers then call `redactSalary(row, req.canViewPayroll ?? false)`
 * without repeating the permission-check logic.  Any new endpoint that returns
 * employee rows just needs to:
 *   1. Ensure the router uses `payrollVisibilityMiddleware`.
 *   2. Call `redactSalary(row, req.canViewPayroll ?? false)` before sending.
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
