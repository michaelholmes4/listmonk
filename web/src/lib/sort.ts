import type { SortingState } from '@tanstack/vue-table'

/**
 * Client-side sort for small lists that are loaded whole (templates, ...). `sorting` is the
 * TanStack state; column ids are looked up in `fields`. Returns a new array.
 */
export function sortRows<T>(rows: readonly T[], sorting: SortingState, fields: Record<string, (row: T) => string | number>): T[] {
  const s = sorting[0]
  const get = s && fields[s.id]
  if (!get) return [...rows]
  const dir = s.desc ? -1 : 1
  return [...rows].sort((a, b) => {
    const x = get(a)
    const y = get(b)
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir
  })
}
