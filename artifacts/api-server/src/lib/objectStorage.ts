import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { createReadStream } from "fs";
import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";

// ---------------------------------------------------------------------------
// Local disk storage.
//
// Replaces the Replit GCS sidecar (which only exists on Replit's own infra)
// with plain files on this server. The public surface of ObjectStorageService
// is unchanged from the GCS version, so none of the callers (routes/storage.ts,
// onboarding.ts, selfService.ts, employee* routes) needed to change.
// ---------------------------------------------------------------------------

const STORAGE_ROOT = process.env.OBJECT_STORAGE_DIR || "/var/lib/whatifi-record/storage";
const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");

function signingSecret(): string {
  const secret = process.env.OBJECT_STORAGE_SIGNING_SECRET;
  if (!secret) {
    throw new Error("OBJECT_STORAGE_SIGNING_SECRET env var is required");
  }
  return secret;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Signed local URLs — replaces GCS presigned URLs. A short-lived HMAC-signed
// token lets the browser PUT/GET a single object directly against this
// server without a session cookie: needed for the unauthenticated onboarding
// upload flow, and for self-service employees downloading their own PDF
// without holding the HR-only permissions that gate /storage/objects/*.
// ---------------------------------------------------------------------------

type SignedAction = "put" | "get";

function sign(action: SignedAction, objectId: string, expires: number): string {
  return createHmac("sha256", signingSecret())
    .update(`${action}:${objectId}:${expires}`)
    .digest("hex");
}

export function verifySignedObjectUrl(
  action: SignedAction,
  objectId: string,
  expiresParam: unknown,
  sigParam: unknown,
): boolean {
  const expires = Number(expiresParam);
  if (!Number.isFinite(expires) || Date.now() > expires) {
    return false;
  }
  if (typeof sigParam !== "string" || sigParam.length === 0) {
    return false;
  }
  const expected = Buffer.from(sign(action, objectId, expires));
  const actual = Buffer.from(sigParam);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function buildSignedUrl(action: SignedAction, objectId: string, ttlSec: number): string {
  const expires = Date.now() + ttlSec * 1000;
  const sig = sign(action, objectId, expires);
  const route = action === "put" ? "local-upload" : "local-download";
  return `/api/storage/${route}/${objectId}?expires=${expires}&sig=${sig}`;
}

// ---------------------------------------------------------------------------
// LocalFile — the subset of the GCS File API the rest of the app actually
// uses (name, exists, delete, getMetadata, createReadStream, save), backed
// by a file on disk plus a small sidecar JSON file for size/content-type
// (the local filesystem has no built-in object-metadata store like GCS does).
// ---------------------------------------------------------------------------

interface StoredMetadata {
  contentType: string;
  size: number;
}

function assertValidObjectId(objectId: string): void {
  // objectId is always a UUID we generated ourselves; still guard against
  // path traversal defensively since it flows through URL params.
  if (!/^[a-zA-Z0-9-]+$/.test(objectId)) {
    throw new ObjectNotFoundError();
  }
}

export class LocalFile {
  constructor(public readonly objectId: string) {
    assertValidObjectId(objectId);
  }

  get name(): string {
    return this.objectId;
  }

  private get filePath(): string {
    return path.join(UPLOADS_DIR, this.objectId);
  }

  private get metaPath(): string {
    return path.join(UPLOADS_DIR, `${this.objectId}.meta.json`);
  }

  async exists(): Promise<[boolean]> {
    try {
      await stat(this.filePath);
      return [true];
    } catch {
      return [false];
    }
  }

  async getMetadata(): Promise<[StoredMetadata]> {
    try {
      const raw = await readFile(this.metaPath, "utf-8");
      return [JSON.parse(raw) as StoredMetadata];
    } catch {
      return [{ contentType: "application/octet-stream", size: 0 }];
    }
  }

  async delete(): Promise<void> {
    await Promise.all([
      unlink(this.filePath).catch(() => {}),
      unlink(this.metaPath).catch(() => {}),
    ]);
  }

  createReadStream(): NodeJS.ReadableStream {
    return createReadStream(this.filePath);
  }

  async save(buffer: Buffer, opts: { contentType: string }): Promise<void> {
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(this.filePath, buffer);
    const meta: StoredMetadata = { contentType: opts.contentType, size: buffer.length };
    await writeFile(this.metaPath, JSON.stringify(meta));
  }
}

// ---------------------------------------------------------------------------
// ObjectStorageService — same public surface every caller already uses.
// ---------------------------------------------------------------------------

export class ObjectStorageService {
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    return buildSignedUrl("put", objectId, 15 * 60);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    const match = rawPath.match(/\/storage\/local-upload\/([a-zA-Z0-9-]+)/);
    if (match) {
      return `/objects/${match[1]}`;
    }
    return rawPath;
  }

  async getObjectEntityFile(objectPath: string): Promise<LocalFile> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const objectId = objectPath.slice("/objects/".length);
    if (!objectId) {
      throw new ObjectNotFoundError();
    }
    const file = new LocalFile(objectId);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  /**
   * Fetch the stored size and content-type for an object entity.
   * Throws `ObjectNotFoundError` if the object does not exist.
   */
  async getObjectEntityMetadata(
    objectPath: string,
  ): Promise<{ size: number; contentType: string }> {
    const file = await this.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    return metadata;
  }

  async downloadObject(file: LocalFile, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream as Readable) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
        "Content-Length": String(metadata.size ?? 0),
      },
    });
  }

  /**
   * Upload a Buffer directly to private object storage.
   * Returns the canonical `/objects/...` path for the uploaded file.
   */
  async uploadBuffer(buffer: Buffer, contentType: string): Promise<string> {
    const objectId = randomUUID();
    const file = new LocalFile(objectId);
    await file.save(buffer, { contentType });
    return `/objects/${objectId}`;
  }

  /**
   * Return a short-lived signed download URL for a private object entity.
   * @param objectPath  Normalised path like `/objects/<uuid>`
   * @param ttlSec      Expiry in seconds (default 15 min)
   */
  async getSignedDownloadUrl(objectPath: string, ttlSec = 900): Promise<string> {
    // Confirm the object actually exists before handing out a link to it.
    await this.getObjectEntityFile(objectPath);
    const objectId = objectPath.slice("/objects/".length);
    return buildSignedUrl("get", objectId, ttlSec);
  }
}
