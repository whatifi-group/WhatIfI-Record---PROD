/**
 * Server-side upload policy for certificate files.
 *
 * These constants are used in two places:
 *  1. `POST /storage/uploads/request-url`  — reject clearly-invalid requests
 *     before issuing a presigned URL (fast, client-visible error).
 *  2. `POST /employees/:id/qualifications/:qualId/certificates` — re-verify
 *     the actual object metadata from GCS before the record is persisted
 *     (prevents a client that lied about size/type to get a URL from
 *     bypassing the policy).
 *
 * Both limits are configurable via environment variables so deployments can
 * tighten or loosen them without code changes:
 *  - `UPLOAD_MAX_BYTES`     — integer, bytes (default: 20971520 = 20 MB)
 *  - `UPLOAD_ALLOWED_TYPES` — comma-separated MIME types
 */

const DEFAULT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const DEFAULT_ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
];

/** Maximum allowed upload size in bytes. Configurable via UPLOAD_MAX_BYTES env var. */
export const MAX_FILE_SIZE_BYTES: number = (() => {
  const raw = process.env.UPLOAD_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_FILE_SIZE_BYTES;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) || parsed <= 0 ? DEFAULT_MAX_FILE_SIZE_BYTES : parsed;
})();

/**
 * MIME types permitted for certificate uploads.
 * Configurable via UPLOAD_ALLOWED_TYPES env var (comma-separated list).
 * Must stay in sync with the `accept` attribute on the file input in
 * `EmployeeQualificationsTab.tsx`.
 */
export const ALLOWED_CONTENT_TYPES: Set<string> = (() => {
  const raw = process.env.UPLOAD_ALLOWED_TYPES;
  if (!raw) return new Set(DEFAULT_ALLOWED_CONTENT_TYPES);
  const types = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return types.length > 0 ? new Set(types) : new Set(DEFAULT_ALLOWED_CONTENT_TYPES);
})();
