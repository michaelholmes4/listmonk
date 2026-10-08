import { describe, expect, it } from 'vitest'
import { parseDay } from './dates'

describe('parseDay', () => {
  it('keeps the calendar day regardless of the local timezone', () => {
    const d = parseDay('2026-10-01T00:00:00Z')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 1])
  })

  it('accepts a bare date', () => {
    expect(parseDay('2026-01-31').getDate()).toBe(31)
  })
})
