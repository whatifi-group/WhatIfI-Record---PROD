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
 */

/** Maximum allowed upload size in bytes (20 MB). */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * MIME types permitted for certificate uploads.
 * Must stay in sync with the `accept` attribute on the file input in
 * `EmployeeQualificationsTab.tsx`.
 */
export const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
]);
