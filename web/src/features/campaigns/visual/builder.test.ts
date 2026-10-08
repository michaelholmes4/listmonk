import { describe, expect, it } from 'vitest'
import { fixTemplateQuotes } from './builder'

describe('fixTemplateQuotes', () => {
  it('unescapes quotes only inside template actions', () => {
    expect(fixTemplateQuotes('<a href="{{ TrackLink &quot;https://x.test&quot; }}">&quot;hi&quot;</a>')).toBe(
      '<a href="{{ TrackLink "https://x.test" }}">&quot;hi&quot;</a>',
    )
  })
})
