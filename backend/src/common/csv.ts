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
