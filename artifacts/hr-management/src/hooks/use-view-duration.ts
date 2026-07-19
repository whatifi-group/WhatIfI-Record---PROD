import { useEffect, useRef } from "react";

/**
 * Reports how long a record detail view stayed open to the SysAdmin audit
 * trail (POST /api/audit-log/view-duration), so "Viewed employee 2585" can
 * become "Viewed James Thompson (#2585) for 3m 12s".
 *
 * Uses `navigator.sendBeacon` rather than a normal fetch — it's the only
 * reliable way to fire a request from a cleanup/unload handler, since the
 * browser can (and does) cancel in-flight fetches when the page unloads or
 * the component unmounts mid-navigation.
 *
 * @param module - the record's module tag, e.g. "hr", "sysadmin" (must match
 *   the tagAuditModule name used for that module's routes on the backend).
 * @param path - the record's page path, e.g. `/employees/2585`.
 * @param active - pass false (or omit an id) while the record isn't loaded
 *   yet / the view isn't open, so no report is sent for a blank state.
 * @param recordLabel - a human-readable name for the record (e.g. the
 *   employee's full name), used in place of the bare id once it's loaded.
 *   Read fresh at unmount time via a ref, so it can arrive after the view
 *   starts without resetting the duration timer.
 */
export function useViewDuration(
  module: string,
  path: string,
  active: boolean,
  recordLabel?: string | null,
): void {
  const startedAtRef = useRef<number | null>(null);
  const labelRef = useRef<string | null | undefined>(recordLabel);
  labelRef.current = recordLabel;

  useEffect(() => {
    if (!active) return;

    startedAtRef.current = Date.now();

    return () => {
      const startedAt = startedAtRef.current;
      if (startedAt === null) return;
      const durationMs = Date.now() - startedAt;

      // Skip near-instant unmounts (e.g. a bounced navigation) — not a
      // meaningful "view" and just adds noise to the trail.
      if (durationMs < 1000) return;

      navigator.sendBeacon?.(
        "/api/audit-log/view-duration",
        new Blob(
          [JSON.stringify({ module, path, durationMs, recordLabel: labelRef.current ?? undefined })],
          { type: "application/json" },
        ),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, module, path]);
}
