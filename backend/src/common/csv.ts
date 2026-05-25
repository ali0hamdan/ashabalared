/** Escape a single CSV cell (RFC-style quoted field). */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}

export function buildCsvDocument(header: string[], rows: unknown[][]): string {
  return [buildCsvRow(header), ...rows.map((r) => buildCsvRow(r))].join('\r\n');
}

/**
 * Content-Disposition safe for Node/Express (ASCII `filename` + RFC 5987 `filename*`).
 * Non-ASCII names in `filename` alone throw ERR_INVALID_CHAR and become HTTP 500.
 */
export function contentDispositionAttachment(filename: string): string {
  const base = (filename.split(/[\\/]/).pop() || 'download.csv').trim() || 'download.csv';
  const ascii =
    base.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'download.csv';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}
