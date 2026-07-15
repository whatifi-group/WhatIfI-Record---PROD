/**
 * Middleware that validates a short-lived onboarding JWT passed in the
 * Authorization header as: `Bearer <token>`.
 *
 * Used to protect POST /api/onboarding/submit from unauthenticated callers
 * while keeping it outside the normal session-based requireAuth guard.
 */
import type { Request, Response, NextFunction } from "express";
import { verifyOnboardingToken } from "../lib/onboardingJwt";

export function requireOnboardingSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Onboarding session token required" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    verifyOnboardingToken(token);
    next();
  } catch (err: any) {
    res
      .status(401)
      .json({ error: err?.message ?? "Invalid or expired onboarding token" });
  }
}
