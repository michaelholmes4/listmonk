import { describe, expect, it } from 'vitest'
import { duration, parseDay } from './dates'

describe('parseDay', () => {
  it('keeps the calendar day regardless of the local timezone', () => {
    const d = parseDay('2026-10-01T00:00:00Z')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 1])
  })

  it('accepts a bare date', () => {
    expect(parseDay('2026-01-31').getDate()).toBe(31)
  })
})

describe('duration', () => {
  it('shows the two largest units', () => {
    expect(duration('2026-01-01T00:00:00Z', '2026-01-01T01:20:05Z')).toBe('1h 20m')
    expect(duration('2026-01-01T00:00:00Z', '2026-01-03T00:00:30Z')).toBe('2d 30s')
  })
  it('is never empty and never negative', () => {
    expect(duration('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe('0s')
    expect(duration('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z')).toBe('0s')
  })
})
