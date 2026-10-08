/**
 * Where this build's source code is published (AGPL §13 asks network users be offered it).
 * Set `VITE_SOURCE_URL` at build time (the release workflow does); without it no link is shown.
 * Only http(s) URLs are accepted, since the value ends up in an `href`.
 */
export function sourceLink(raw: string | undefined = import.meta.env.VITE_SOURCE_URL): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}
