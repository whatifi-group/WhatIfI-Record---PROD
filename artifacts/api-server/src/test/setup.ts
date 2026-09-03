/**
 * Per-fork test setup: runs inside every test process.
 *
 * (One-time database seeding lives in globalSetup.ts instead — see the note
 * there about why it must not happen per-fork.)
 */
import { afterAll } from "vitest";
import { pool } from "@workspace/db";

// The onboarding portal signs its JWTs with SESSION_SECRET and throws without
// one (lib/onboardingJwt.ts getSecret), which surfaces as an opaque 500 from
// POST /onboarding/verify. Tests never boot the real server, so nothing else
// sets it. A fixed value is fine — these tokens are HMAC-signed and verified
// within the same process.
process.env.SESSION_SECRET ??= "test-session-secret";

afterAll(async () => {
  // End the pg pool so node exits cleanly after each test file.
  await pool.end();
});
