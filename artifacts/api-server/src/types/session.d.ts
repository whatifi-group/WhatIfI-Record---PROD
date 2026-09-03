import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: number;
    /**
     * In-flight Microsoft SSO handshake. Written by `GET /auth/sso/login`
     * before redirecting to Entra and consumed by `GET /auth/sso/callback`;
     * cleared as soon as the callback completes, successfully or not.
     */
    sso?: {
      codeVerifier: string;
      state: string;
      nonce: string;
    };
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
      /**
       * Whether the current caller may view payroll-sensitive fields (salary).
       * Set once per request by `payrollVisibilityMiddleware` on the HR router.
       * Defaults to `false` — treat absent as hidden.
       */
      canViewPayroll?: boolean;
    }
  }
}
