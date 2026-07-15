import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import { getEffectivePermissions } from "../middlewares/requirePermission";
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_CONTENT_TYPES,
} from "../lib/uploadPolicy";

const router: IRouter = Router();
export const objectStorageService = new ObjectStorageService();

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
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * Unconditionally public — no authentication or ACL checks.
 */
router.get(
  "/storage/public-objects/*filePath",
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

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
    } catch (error) {
      console.error("Error serving public object", error);
      res.status(500).json({ error: "Failed to serve public object" });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * Requires an authenticated session and view_payroll/sysadmin permission —
 * stored objects are HR documents (certificates, attachments) that must not
 * be accessible to authenticated users without the appropriate role.
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

    if (!perms.has("view_payroll") && !perms.has("sysadmin")) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile =
        await objectStorageService.getObjectEntityFile(objectPath);

      const response = await objectStorageService.downloadObject(objectFile);

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
