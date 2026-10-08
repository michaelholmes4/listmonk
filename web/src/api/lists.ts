import { api } from './client'
import type { List, NewList, Paginated } from './types'

/**
 * Every list the user may see, without subscriber counts (fast). The pickers use this; the
 * lists screen uses the full, paginated query.
 */
export async function getAllLists(): Promise<List[]> {
  // An empty result comes back as `[]` rather than a page object.
  const res = await api.get<Paginated<List> | never[]>('/api/lists', { minimal: true, per_page: 'all' })
  return Array.isArray(res) ? res : res.results
}

export interface ListQuery {
  query?: string
  status: 'active' | 'archived'
  page: number
  perPage: number | 'all'
  /** Unset = oldest first (the server's default, by id). */
  orderBy?: 'name' | 'status' | 'created_at' | 'updated_at' | 'subscriber_count'
  order?: 'ASC' | 'DESC'
}

// The server matches names with a tsquery-ish LIKE; punctuation only produces errors.
const cleanQuery = (q?: string) => (q ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim()

export const queryLists = (q: ListQuery, signal?: AbortSignal) =>
  api.get<Paginated<List>>(
    '/api/lists',
    {
      query: cleanQuery(q.query) || undefined,
      status: q.status,
      page: q.page,
      per_page: q.perPage,
      order_by: q.orderBy,
      order: q.order,
    },
    { signal },
  )

export const getList = (id: number) => api.get<List>(`/api/lists/${id}`)

export const createList = (body: NewList) => api.post<List>('/api/lists', body)

export const updateList = (id: number, body: NewList) => api.put<List>(`/api/lists/${id}`, body)

export const deleteList = (id: number) => api.delete<boolean>(`/api/lists/${id}`)

export const deleteLists = (ids: number[]) => api.delete<boolean>('/api/lists', { id: ids })

/**
 * IDs of every list matching a filter, for "select all N". The backend's delete-by-query ignores
 * the status filter (it would also delete archived lists from the active view and vice versa),
 * so we resolve the exact set here and delete by ID.
 */
export async function getMatchingListIds(q: Omit<ListQuery, 'page' | 'perPage'>): Promise<number[]> {
  const res = await queryLists({ ...q, page: 1, perPage: 'all' })
  return res.results.map((l) => l.id!)
}

/** Creates a draft opt-in campaign for a double opt-in list; returns it so the caller can open its editor. */
export const createOptinCampaign = (list: { id: number; name: string }, t: (k: string, p: object) => string) =>
  api.post<{ id: number }>('/api/campaigns', {
    name: t('lists.optinTo', { name: list.name }),
    subject: t('lists.confirmSub', { name: list.name }),
    lists: [list.id],
    content_type: 'richtext',
    messenger: 'email',
    type: 'optin',
  })
