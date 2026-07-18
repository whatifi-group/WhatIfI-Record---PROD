import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import express, { Router, type IRouter, type Request, type Response } from "express";

import {
  LocalFile,
  ObjectNotFoundError,
  ObjectStorageService,
  verifySignedObjectUrl,
} from "../lib/objectStorage";
import { getEffectivePermissions } from "../middlewares/requirePermission";
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_CONTENT_TYPES,
} from "../lib/uploadPolicy";

const router: IRouter = Router();
export const objectStorageService = new ObjectStorageService();

/** Stream a stored file to the response, mirroring its Content-Type/-Length. */
async function streamFileToResponse(res: Response, file: LocalFile): Promise<void> {
  const response = await objectStorageService.downloadObject(file);
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (response.body) {
    const nodeStream = Readable.fromWeb(
      response.body as ReadableStream<Uint8Array>,
    );
    nodeStream.pipe(res);
  } else {
    res.end();
  }
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires an authenticated session.
 */
router.post(
  "/storage/uploads/request-url",
  async (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    const { name, size, contentType } = parsed.data;

    if (size > MAX_FILE_SIZE_BYTES) {
      res.status(400).json({
        error: `File size exceeds the 20 MB limit (received ${(size / 1024 / 1024).toFixed(1)} MB).`,
      });
      return;
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      res.status(400).json({
        error: `File type "${contentType}" is not allowed. Accepted types: PDF, PNG, JPEG, GIF, WEBP, HEIC.`,
      });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      console.error("Error generating upload URL", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

/**
 * PUT /storage/local-upload/:objectId
 *
 * Backs the presigned URL returned by /storage/uploads/request-url.
 * Not session-gated (see middlewares/requireAuth.ts) — the HMAC signature +
 * expiry embedded in the URL is the auth, exactly like a real GCS presigned
 * URL. Anyone with the link can upload once, before it expires.
 */
router.put(
  "/storage/local-upload/:objectId",
  express.raw({ type: () => true, limit: "25mb" }),
  async (req: Request, res: Response) => {
    const objectId = String(req.params.objectId);
    const { expires, sig } = req.query;

    if (!verifySignedObjectUrl("put", objectId, expires, sig)) {
      res.status(403).json({ error: "Invalid or expired upload link" });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Missing request body" });
      return;
    }

    try {
      const contentType = req.headers["content-type"] || "application/octet-stream";
      const file = new LocalFile(objectId);
      await file.save(req.body, { contentType });
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("Error saving uploaded object", error);
      res.status(500).json({ error: "Failed to save uploaded file" });
    }
  },
);

/**
 * GET /storage/local-download/:objectId
 *
 * Backs the signed URL returned by ObjectStorageService.getSignedDownloadUrl,
 * used for self-service PDF downloads that can't go through the HR-gated
 * /storage/objects/* route below. Not session-gated — the HMAC signature +
 * expiry is the auth.
 */
router.get(
  "/storage/local-download/:objectId",
  async (req: Request, res: Response) => {
    const objectId = String(req.params.objectId);
    const { expires, sig } = req.query;

    if (!verifySignedObjectUrl("get", objectId, expires, sig)) {
      res.status(403).json({ error: "Invalid or expired download link" });
      return;
    }

    try {
      const file = new LocalFile(objectId);
      const [exists] = await file.exists();
      if (!exists) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      await streamFileToResponse(res, file);
    } catch (error) {
      console.error("Error serving signed object", error);
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from private storage.
 * Requires an authenticated session plus one of:
 *  - view_payroll  — full payroll HR staff
 *  - sysadmin      — system administrators
 *  - hr:access     — HR managers (needed to review qualification certificates
 *                    in the onboarding queue without needing payroll access)
 *
 * Note: view_employee_directory (self-service) is intentionally excluded —
 * this endpoint serves the full private namespace and cannot enforce per-object
 * ownership checks; granting it here would let any self-service user retrieve
 * other employees' documents once a path is known.
 */
router.get(
  "/storage/objects/*path",
  async (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const perms = req.effectivePermissions
      ?? (await getEffectivePermissions(req.session.userId));

    const canRead =
      perms.has("view_payroll") ||
      perms.has("sysadmin") ||
      perms.has("hr:access");

    if (!canRead) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile =
        await objectStorageService.getObjectEntityFile(objectPath);

      await streamFileToResponse(res, objectFile);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      console.error("Error serving object", error);
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

/**
 * GET /storage/upload-policy
 *
 * Returns the server's active upload limits so the client can run pre-flight
 * validation before sending any bytes. No authentication required — the limits
 * are not sensitive information.
 */
router.get("/storage/upload-policy", (_req: Request, res: Response) => {
  res.json({
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    allowedContentTypes: Array.from(ALLOWED_CONTENT_TYPES),
  });
});

export default router;
