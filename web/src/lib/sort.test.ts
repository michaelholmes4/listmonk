import { describe, expect, it } from 'vitest'
import { sortRows } from './sort'

const rows = [
  { id: 2, name: 'b' },
  { id: 10, name: 'a' },
  { id: 1, name: 'C' },
]
const fields = { id: (r: (typeof rows)[number]) => r.id, name: (r: (typeof rows)[number]) => r.name }

describe('sortRows', () => {
  it('sorts numbers numerically, not as strings', () => {
    expect(sortRows(rows, [{ id: 'id', desc: false }], fields).map((r) => r.id)).toEqual([1, 2, 10])
  })
  it('sorts text case-insensitively and descending', () => {
    expect(sortRows(rows, [{ id: 'name', desc: true }], fields).map((r) => r.name)).toEqual(['C', 'b', 'a'])
  })
  it('keeps the original order with no sort, without mutating the input', () => {
    const out = sortRows(rows, [], fields)
    expect(out.map((r) => r.id)).toEqual([2, 10, 1])
    expect(out).not.toBe(rows)
  })
})
