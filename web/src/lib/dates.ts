/**
 * Parses the date part of an API timestamp ("2026-10-01T00:00:00Z") as a LOCAL calendar day.
 * The server buckets by UTC day; going through `new Date(iso)` would shift the label back a
 * day for users west of UTC.
 */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
