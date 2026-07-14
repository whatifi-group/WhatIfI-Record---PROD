import type { Request, Response, NextFunction } from "express";

// Routes that don't require authentication.
// These are matched against req.path which is relative to the /api mount point.
const PUBLIC_PATHS = new Set(["/auth/login", "/healthz"]);

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }

  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  next();
}
