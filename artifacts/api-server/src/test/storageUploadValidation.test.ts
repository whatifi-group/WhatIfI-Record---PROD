/**
 * Tests for POST /storage/uploads/request-url validation.
 *
 * Verifies that the endpoint rejects requests with oversized files or
 * disallowed MIME types before issuing a presigned URL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import router, { objectStorageService } from "../routes/storage";
import { buildApp } from "./helpers";

// Build the app with a fake authenticated session (userId = 1).
const api = buildApp(router, 1);

const VALID_BODY = {
  name: "certificate.pdf",
  size: 1024 * 100, // 100 KB — well within limit
  contentType: "application/pdf",
};

/** The endpoint path as seen through the test app (mounted at /api). */
const URL = "/api/storage/uploads/request-url";

describe("POST /storage/uploads/request-url — upload validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(objectStorageService, "getObjectEntityUploadURL").mockResolvedValue(
      "https://storage.example.com/upload?sig=fake",
    );
    vi.spyOn(objectStorageService, "normalizeObjectEntityPath").mockReturnValue(
      "/objects/uploads/fake-uuid",
    );
  });

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it("returns 401 when there is no session", async () => {
    const unauthApi = buildApp(router); // no userId → no session
    const res = await unauthApi.post(URL).send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("returns 200 and a presigned URL for a valid PDF upload", async () => {
    const res = await api.post(URL).send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("uploadURL");
    expect(res.body).toHaveProperty("objectPath");
  });

  it.each([
    ["image/png", "photo.png"],
    ["image/jpeg", "photo.jpg"],
    ["image/gif", "anim.gif"],
    ["image/webp", "photo.webp"],
    ["image/heic", "photo.heic"],
  ])("accepts allowed MIME type %s", async (contentType, name) => {
    const res = await api.post(URL).send({ name, size: 512, contentType });
    expect(res.status).toBe(200);
  });

  // ── Size validation ────────────────────────────────────────────────────────

  it("returns 400 when size exceeds 20 MB", async () => {
    const res = await api.post(URL).send({
      ...VALID_BODY,
      size: 20 * 1024 * 1024 + 1, // one byte over
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/20 MB/);
  });

  it("returns 200 when size is exactly 20 MB", async () => {
    const res = await api.post(URL).send({
      ...VALID_BODY,
      size: 20 * 1024 * 1024,
    });
    expect(res.status).toBe(200);
  });

  it("includes the received file size in the error message", async () => {
    const oversizeMB = 25;
    const res = await api.post(URL).send({
      ...VALID_BODY,
      size: oversizeMB * 1024 * 1024,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/25\.0 MB/);
  });

  // ── MIME-type validation ───────────────────────────────────────────────────

  it("returns 400 for a disallowed MIME type (video/mp4)", async () => {
    const res = await api.post(URL).send({
      ...VALID_BODY,
      contentType: "video/mp4",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/video\/mp4/);
    expect(res.body.error).toMatch(/not allowed/);
  });

  it("returns 400 for an executable MIME type (application/x-msdownload)", async () => {
    const res = await api.post(URL).send({
      ...VALID_BODY,
      contentType: "application/x-msdownload",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/);
  });

  it("returns 400 for application/octet-stream", async () => {
    const res = await api.post(URL).send({
      ...VALID_BODY,
      contentType: "application/octet-stream",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/);
  });

  it("mentions the accepted types in the MIME-type error", async () => {
    const res = await api.post(URL).send({
      ...VALID_BODY,
      contentType: "text/plain",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PDF/i);
    expect(res.body.error).toMatch(/JPEG/i);
  });

  // ── Schema validation ──────────────────────────────────────────────────────

  it("returns 400 when the request body is missing required fields", async () => {
    const res = await api
      .post(URL)
      .send({ name: "file.pdf" }); // missing size and contentType
    expect(res.status).toBe(400);
  });

  it("does not call getObjectEntityUploadURL when validation fails", async () => {
    const spy = vi.spyOn(objectStorageService, "getObjectEntityUploadURL");
    await api.post(URL).send({
      ...VALID_BODY,
      contentType: "video/mp4",
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── GET /storage/upload-policy ────────────────────────────────────────────────

describe("GET /storage/upload-policy", () => {
  const POLICY_URL = "/api/storage/upload-policy";

  it("returns 200 with maxFileSizeBytes and allowedContentTypes", async () => {
    const unauthApi = buildApp(router); // no auth required
    const res = await unauthApi.get(POLICY_URL);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("maxFileSizeBytes");
    expect(res.body).toHaveProperty("allowedContentTypes");
    expect(typeof res.body.maxFileSizeBytes).toBe("number");
    expect(Array.isArray(res.body.allowedContentTypes)).toBe(true);
  });

  it("includes application/pdf in allowedContentTypes", async () => {
    const res = await api.get(POLICY_URL);
    expect(res.body.allowedContentTypes).toContain("application/pdf");
  });

  it("returns maxFileSizeBytes matching the server limit (20 MB default)", async () => {
    const res = await api.get(POLICY_URL);
    expect(res.body.maxFileSizeBytes).toBe(20 * 1024 * 1024);
  });

  it("is accessible without authentication", async () => {
    const unauthApi = buildApp(router);
    const res = await unauthApi.get(POLICY_URL);
    expect(res.status).toBe(200);
  });
});
