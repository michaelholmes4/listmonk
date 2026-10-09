import { describe, expect, it } from 'vitest'
import { useDraftSaver } from './useDraftSaver'

/** A save whose completion the test controls. */
function controlled() {
  const calls: { ok: () => void; fail: () => void }[] = []
  const save = () =>
    new Promise<number>((resolve, reject) => {
      calls.push({ ok: () => resolve(calls.length), fail: () => reject(new Error('nope')) })
    })
  return { calls, save }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('useDraftSaver', () => {
  it('saves once per request when idle, and reports the status', async () => {
    const c = controlled()
    const s = useDraftSaver(c.save, () => new Date(0))
    expect(s.status.value).toBe('idle')
    s.request()
    expect(s.status.value).toBe('saving')
    expect(s.pending.value).toBe(true)
    c.calls[0].ok()
    await s.flush()
    expect(s.status.value).toBe('saved')
    expect(s.savedAt.value).toEqual(new Date(0))
    expect(s.pending.value).toBe(false)
    expect(c.calls).toHaveLength(1)
  })

  it('never has two saves in flight, and coalesces requests made meanwhile into one', async () => {
    const c = controlled()
    const s = useDraftSaver(c.save)
    s.request()
    s.request()
    s.request()
    expect(c.calls).toHaveLength(1)
    c.calls[0].ok()
    await tick()
    expect(c.calls).toHaveLength(2)
    expect(s.status.value).toBe('saving')
    c.calls[1].ok()
    await s.flush()
    expect(c.calls).toHaveLength(2)
    expect(s.status.value).toBe('saved')
  })

  it('stays failed after an error and retries with the latest flow', async () => {
    const c = controlled()
    const s = useDraftSaver(c.save)
    s.request()
    c.calls[0].fail()
    expect(await s.flush()).toBe(false)
    expect(s.status.value).toBe('error')
    expect(s.pending.value).toBe(true)
    s.retry()
    expect(c.calls).toHaveLength(2)
    c.calls[1].ok()
    expect(await s.flush()).toBe(true)
    expect(s.status.value).toBe('saved')
  })

  it('a change made during a failing save is not lost: the retry covers it', async () => {
    const c = controlled()
    const s = useDraftSaver(c.save)
    s.request()
    s.request()
    c.calls[0].fail()
    await s.flush()
    expect(s.status.value).toBe('error')
    s.retry()
    c.calls[1].ok()
    expect(await s.flush()).toBe(true)
  })

  it('flush waits for a save in flight', async () => {
    const c = controlled()
    const s = useDraftSaver(c.save)
    s.request()
    let done = false
    void s.flush().then(() => (done = true))
    await tick()
    expect(done).toBe(false)
    c.calls[0].ok()
    await tick()
    expect(done).toBe(true)
  })
})
