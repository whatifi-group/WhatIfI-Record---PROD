/**
 * Lightweight HMAC-SHA256 JWT utility for short-lived onboarding sessions.
 *
 * These tokens are issued by POST /api/onboarding/verify (after the shared
 * onboarding password is validated) and consumed by requireOnboardingSession
 * middleware on POST /api/onboarding/submit. No DB row is written — the token
 * is entirely self-contained and stateless.
 *
 * Format: base64url(header).base64url(payload).base64url(signature)
 */
import crypto from "node:crypto";

const ALGORITHM = "sha256";
const TTL_SECONDS = 60 * 60; // 1 hour

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64url");
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for onboarding JWT signing");
  return secret;
}

interface OnboardingTokenPayload {
  type: "onboarding_session";
  iat: number;
  exp: number;
}

/**
 * Creates a signed onboarding session token valid for 1 hour.
 */
export function signOnboardingToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: OnboardingTokenPayload = {
    type: "onboarding_session",
    iat: now,
    exp: now + TTL_SECONDS,
  };

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const sig = crypto
    .createHmac(ALGORITHM, getSecret())
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64url(sig)}`;
}

/**
 * Verifies an onboarding token. Returns the payload or throws.
 */
export function verifyOnboardingToken(token: string): OnboardingTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");

  const [header, body, sigB64] = parts;
  const signingInput = `${header}.${body}`;

  const expectedSig = crypto
    .createHmac(ALGORITHM, getSecret())
    .update(signingInput)
    .digest();

  const actualSig = Buffer.from(sigB64, "base64url");
  if (actualSig.length !== expectedSig.length) throw new Error("Invalid signature");

  // Timing-safe comparison
  if (!crypto.timingSafeEqual(expectedSig, actualSig)) {
    throw new Error("Invalid signature");
  }

  let payload: OnboardingTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new Error("Malformed payload");
  }

  if (payload.type !== "onboarding_session") {
    throw new Error("Invalid token type");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error("Token expired");
  }

  return payload;
}
