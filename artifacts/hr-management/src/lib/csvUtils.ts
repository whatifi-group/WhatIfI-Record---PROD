/**
 * Escapes a single CSV field value per RFC 4180.
 *
 * Rules:
 *  - null/undefined → empty string (no quotes)
 *  - Fields containing a comma, double-quote, or newline are wrapped in
 *    double-quotes; any embedded double-quote is doubled ("").
 *  - All other values are returned as-is.
 */
export function escapeCsv(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds the full CSV string from a header row and data rows.
 * Each cell is passed through escapeCsv before joining.
 */
export function buildCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsv).join(","));
  return [headerLine, ...dataLines].join("\n");
}

/**
 * Returns the download filename for a work-records export.
 * Dates that are empty / falsy become "all".
 */
export function workRecordsCsvFilename(
  dateFrom: string | undefined,
  dateTo: string | undefined,
): string {
  const fromPart = dateFrom || "all";
  const toPart = dateTo || "all";
  return `work-records-${fromPart}-to-${toPart}.csv`;
}
