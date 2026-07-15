import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

// Augment the Express Request type so middlewares can share the resolved
// permission set without each one making a separate DB round-trip.
declare global {
  namespace Express {
    interface Request {
      /**
       * Effective permissions (role + user-level overrides) for the
       * authenticated user, attached once by `requireAuth` and reused by
       * `requirePermission` and route handlers.
       * Undefined on public routes where `requireAuth` skips the DB call.
       */
      effectivePermissions?: Set<string>;
    }
  }
}
