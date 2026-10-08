import { api } from './client'
import type { List, Paginated } from './types'

/**
 * Every list the user may see, without subscriber counts (fast). The pickers use this; the
 * lists screen uses the full, paginated query.
 */
export async function getAllLists(): Promise<List[]> {
  // An empty result comes back as `[]` rather than a page object.
  const res = await api.get<Paginated<List> | never[]>('/api/lists', { minimal: true, per_page: 'all' })
  return Array.isArray(res) ? res : res.results
}
