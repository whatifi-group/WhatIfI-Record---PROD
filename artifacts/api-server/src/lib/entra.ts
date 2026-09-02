/**
 * Microsoft Entra ID (Azure AD) OIDC client.
 *
 * RECORD delegates *authentication* to the WhatIfI tenant and keeps
 * *authorization* entirely local — a successful sign-in only resolves which
 * `users` row the caller is, after which the existing session cookie, roles
 * and permission model take over unchanged.
 *
 * Flow: server-side authorization code grant with PKCE. The browser never
 * sees a token; the outcome is the same `connect.sid` session cookie that
 * password login has always produced.
 *
 * Configure via environment variables (all four required to enable SSO):
 *   AZURE_TENANT_ID      Directory (tenant) ID — pins sign-in to our tenant
 *   AZURE_CLIENT_ID      Application (client) ID of the app registration
 *   AZURE_CLIENT_SECRET  Client secret from the same registration
 *   AZURE_REDIRECT_URI   This deployment's callback, which must be registered
 *                        in Entra. DEV and PROD share one app registration and
 *                        differ only by this value.
 *
 * When any is missing, `ssoEnabled()` returns false, the /auth/sso routes
 * answer 503 and the login page falls back to the password form — so an
 * unconfigured deployment degrades cleanly rather than failing at boot.
 */
import * as client from "openid-client";

/** Only what is needed to identify the user — no Microsoft Graph access. */
const SCOPES = "openid profile email";

export interface EntraClaims {
  /** Immutable per-tenant object id (`oid`). */
  objectId: string;
  /** Tenant id (`tid`), checked against AZURE_TENANT_ID. */
  tenantId: string;
  email: string;
  name: string;
}

export function ssoEnabled(): boolean {
  return Boolean(
    process.env.AZURE_TENANT_ID &&
      process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_REDIRECT_URI,
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is required for SSO`);
  return value;
}

export function redirectUri(): string {
  return requireEnv("AZURE_REDIRECT_URI");
}

let configPromise: Promise<client.Configuration> | null = null;

/**
 * Discover and cache the tenant's OIDC metadata.
 *
 * The authority is tenant-specific (not `/common` or `/organizations`), so
 * tokens issued by any other Entra tenant fail issuer validation outright.
 * Discovery is performed once per process and reused.
 */
export function getConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const tenantId = requireEnv("AZURE_TENANT_ID");
    configPromise = client
      .discovery(
        new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`),
        requireEnv("AZURE_CLIENT_ID"),
        requireEnv("AZURE_CLIENT_SECRET"),
      )
      .catch((err) => {
        // Don't cache a failed discovery — a transient network blip at boot
        // would otherwise disable SSO until the process restarts.
        configPromise = null;
        throw err;
      });
  }
  return configPromise;
}

/** Test seam: drop the cached discovery result. */
export function resetConfigCache(): void {
  configPromise = null;
}

export interface AuthRequest {
  url: string;
  codeVerifier: string;
  state: string;
  nonce: string;
}

/**
 * Build the Microsoft sign-in URL plus the PKCE/CSRF values that must be
 * stashed in the session until the callback.
 *
 * `prompt` is normally omitted — that is what makes this single sign-on: a
 * user with a live Microsoft session is bounced straight back without seeing
 * a Microsoft screen. Pass "select_account" for the explicit
 * "use a different account" path.
 */
export async function buildAuthRequest(prompt?: string): Promise<AuthRequest> {
  const config = await getConfig();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const parameters: Record<string, string> = {
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  };
  if (prompt) parameters.prompt = prompt;

  return {
    url: client.buildAuthorizationUrl(config, parameters).href,
    codeVerifier,
    state,
    nonce,
  };
}

/**
 * Exchange the authorization code for tokens and return the verified identity.
 *
 * `authorizationCodeGrant` validates the ID token signature against the
 * tenant's JWKS along with the issuer, audience, `state` and `nonce`; anything
 * that fails throws. Signature validation is precisely the part that must not
 * be hand-rolled, which is why this goes through openid-client.
 */
export async function exchangeCode(
  currentUrl: URL,
  checks: { codeVerifier: string; state: string; nonce: string },
): Promise<EntraClaims> {
  const config = await getConfig();

  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: checks.codeVerifier,
    expectedState: checks.state,
    expectedNonce: checks.nonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();
  if (!claims) throw new Error("ID token contained no claims");

  const objectId = typeof claims.oid === "string" ? claims.oid : null;
  const tenantId = typeof claims.tid === "string" ? claims.tid : null;
  if (!objectId || !tenantId) {
    throw new Error("ID token missing required oid/tid claims");
  }

  // `email` is only present when the account has a mail attribute; Entra work
  // accounts always carry the UPN in `preferred_username`, so fall back to it.
  const email =
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.preferred_username === "string" && claims.preferred_username) ||
    null;
  if (!email) throw new Error("ID token missing an email/preferred_username claim");

  const name =
    (typeof claims.name === "string" && claims.name) || email;

  return { objectId, tenantId, email, name };
}
