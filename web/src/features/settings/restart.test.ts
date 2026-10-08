import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/settings', () => ({ getHealth: vi.fn() }))
import { getHealth } from '@/api/settings'
import { needsRestart, waitForReload } from './restart'

afterEach(() => vi.clearAllMocks())

describe('needsRestart', () => {
  it('is true only for the running-campaigns answer', () => {
    expect(needsRestart(true)).toBe(false)
    expect(needsRestart({ needs_restart: true })).toBe(true)
    expect(needsRestart({})).toBe(false)
  })
})

describe('waitForReload', () => {
  it('returns once the server has gone down and come back', async () => {
    const health = vi.mocked(getHealth)
    health.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('down')).mockResolvedValue(true)
    await waitForReload({ intervalMs: 1, settleMs: 10_000 })
    expect(health).toHaveBeenCalledTimes(4)
  })

  it('does not wait forever for a restart that never visibly happens', async () => {
    vi.mocked(getHealth).mockResolvedValue(true)
    await waitForReload({ intervalMs: 5, settleMs: 30 })
    expect(vi.mocked(getHealth).mock.calls.length).toBeGreaterThan(1)
  })

  it('gives up after the timeout', async () => {
    vi.mocked(getHealth).mockRejectedValue(new Error('down'))
    const t0 = Date.now()
    await waitForReload({ intervalMs: 5, timeoutMs: 40 })
    expect(Date.now() - t0).toBeLessThan(500)
  })
})
