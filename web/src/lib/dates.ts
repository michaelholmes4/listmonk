/**
 * Parses the date part of an API timestamp ("2026-10-01T00:00:00Z") as a LOCAL calendar day.
 * The server buckets by UTC day; going through `new Date(iso)` would shift the label back a
 * day for users west of UTC.
 */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "1h 20m 5s" between two timestamps (the two largest non-zero units, never empty). */
export function duration(from: Date | string, to: Date | string): string {
  const ms = Math.max(0, new Date(to).getTime() - new Date(from).getTime())
  const s = Math.floor(ms / 1000)
  const parts: [number, string][] = [
    [Math.floor(s / 86400), 'd'],
    [Math.floor((s % 86400) / 3600), 'h'],
    [Math.floor((s % 3600) / 60), 'm'],
    [s % 60, 's'],
  ]
  const shown = parts.filter(([n]) => n > 0).slice(0, 2)
  return shown.length ? shown.map(([n, u]) => `${n}${u}`).join(' ') : '0s'
}
