import { getHealth } from '@/api/settings'
import type { SettingsSaved } from '@/api/types'

/** What happened after saving settings. */
export type SaveOutcome = 'reloaded' | 'needs-restart'

export const needsRestart = (saved: SettingsSaved): boolean =>
  typeof saved === 'object' && saved !== null && 'needs_restart' in saved && !!saved.needs_restart

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The server reloads itself about half a second after saving settings, so for a moment it still
 * answers. Wait until it has gone away and come back (or, if it never visibly went down, a few
 * seconds), so what the caller refetches next is the new configuration.
 */
export async function waitForReload(opts: { intervalMs?: number; settleMs?: number; timeoutMs?: number } = {}): Promise<void> {
  const { intervalMs = 500, settleMs = 4000, timeoutMs = 60_000 } = opts
  const start = Date.now()
  let sawDown = false
  while (Date.now() - start < timeoutMs) {
    await sleep(intervalMs)
    try {
      await getHealth()
      if (sawDown || Date.now() - start >= settleMs) return
    } catch {
      sawDown = true
    }
  }
}
