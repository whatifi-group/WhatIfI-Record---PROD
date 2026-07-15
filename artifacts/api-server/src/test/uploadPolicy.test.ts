/**
 * Tests for the uploadPolicy module's env-var override behaviour.
 *
 * Because MAX_FILE_SIZE_BYTES and ALLOWED_CONTENT_TYPES are evaluated at
 * module-load time, each test that exercises an override must clear the module
 * registry, set process.env, import the module fresh, then restore state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function loadPolicy() {
  // Dynamically import after env vars are set so the IIFE re-evaluates.
  return import("../lib/uploadPolicy");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("uploadPolicy — env-var overrides", () => {
  let originalMaxBytes: string | undefined;
  let originalAllowedTypes: string | undefined;

  beforeEach(() => {
    originalMaxBytes = process.env.UPLOAD_MAX_BYTES;
    originalAllowedTypes = process.env.UPLOAD_ALLOWED_TYPES;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalMaxBytes === undefined) {
      delete process.env.UPLOAD_MAX_BYTES;
    } else {
      process.env.UPLOAD_MAX_BYTES = originalMaxBytes;
    }
    if (originalAllowedTypes === undefined) {
      delete process.env.UPLOAD_ALLOWED_TYPES;
    } else {
      process.env.UPLOAD_ALLOWED_TYPES = originalAllowedTypes;
    }
    vi.resetModules();
  });

  it("defaults to 20 MB when UPLOAD_MAX_BYTES is not set", async () => {
    delete process.env.UPLOAD_MAX_BYTES;
    const { MAX_FILE_SIZE_BYTES } = await loadPolicy();
    expect(MAX_FILE_SIZE_BYTES).toBe(20 * 1024 * 1024);
  });

  it("reads MAX_FILE_SIZE_BYTES from UPLOAD_MAX_BYTES env var", async () => {
    process.env.UPLOAD_MAX_BYTES = "5242880"; // 5 MB
    const { MAX_FILE_SIZE_BYTES } = await loadPolicy();
    expect(MAX_FILE_SIZE_BYTES).toBe(5242880);
  });

  it("falls back to default when UPLOAD_MAX_BYTES is not a valid integer", async () => {
    process.env.UPLOAD_MAX_BYTES = "not-a-number";
    const { MAX_FILE_SIZE_BYTES } = await loadPolicy();
    expect(MAX_FILE_SIZE_BYTES).toBe(20 * 1024 * 1024);
  });

  it("falls back to default when UPLOAD_MAX_BYTES is zero or negative", async () => {
    process.env.UPLOAD_MAX_BYTES = "0";
    const { MAX_FILE_SIZE_BYTES: zero } = await loadPolicy();
    expect(zero).toBe(20 * 1024 * 1024);

    vi.resetModules();
    process.env.UPLOAD_MAX_BYTES = "-1024";
    const { MAX_FILE_SIZE_BYTES: neg } = await loadPolicy();
    expect(neg).toBe(20 * 1024 * 1024);
  });

  it("defaults to the standard MIME set when UPLOAD_ALLOWED_TYPES is not set", async () => {
    delete process.env.UPLOAD_ALLOWED_TYPES;
    const { ALLOWED_CONTENT_TYPES } = await loadPolicy();
    expect(ALLOWED_CONTENT_TYPES.has("application/pdf")).toBe(true);
    expect(ALLOWED_CONTENT_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_CONTENT_TYPES.has("video/mp4")).toBe(false);
  });

  it("reads ALLOWED_CONTENT_TYPES from UPLOAD_ALLOWED_TYPES env var", async () => {
    process.env.UPLOAD_ALLOWED_TYPES = "image/png, image/jpeg";
    const { ALLOWED_CONTENT_TYPES } = await loadPolicy();
    expect(ALLOWED_CONTENT_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_CONTENT_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_CONTENT_TYPES.has("application/pdf")).toBe(false);
  });

  it("falls back to default when UPLOAD_ALLOWED_TYPES is blank/empty", async () => {
    process.env.UPLOAD_ALLOWED_TYPES = "  ,  , ";
    const { ALLOWED_CONTENT_TYPES } = await loadPolicy();
    expect(ALLOWED_CONTENT_TYPES.has("application/pdf")).toBe(true);
  });
});
