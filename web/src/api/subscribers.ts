import { api } from './client'
import type {
  BounceRecord,
  NewSubscriber,
  Paginated,
  Subscriber,
  SubscriberActivity,
  SubscriberBulkRequest,
} from './types'

/** The filter shared by the list query, exports and every "all matching" bulk action. */
export interface SubscriberFilter {
  /** Simple name/e-mail search. Ignored when `query` is set. */
  search?: string
  /** Advanced SQL expression. */
  query?: string
  listIds?: number[]
  subscriptionStatus?: string
}

export interface SubscriberQuery extends SubscriberFilter {
  page: number
  perPage: number
  /** Unset = newest first (the server's default, by id). */
  orderBy?: 'email' | 'name' | 'status' | 'created_at' | 'updated_at'
  order?: 'ASC' | 'DESC'
}

/** Body fields for the by-query bulk endpoints. */
const filterBody = (f: SubscriberFilter): SubscriberBulkRequest => ({
  search: f.query ? '' : f.search,
  query: f.query,
  list_ids: f.listIds?.length ? f.listIds : undefined,
  subscription_status: f.subscriptionStatus || undefined,
})

export const getSubscribers = (q: SubscriberQuery, signal?: AbortSignal) =>
  api.get<Paginated<Subscriber>>(
    '/api/subscribers',
    {
      ...(q.query ? { query: q.query } : { search: q.search || undefined }),
      list_id: q.listIds,
      subscription_status: q.subscriptionStatus || undefined,
      page: q.page,
      per_page: q.perPage,
      order_by: q.orderBy,
      order: q.order,
    },
    { signal },
  )

export const getSubscriber = (id: number) => api.get<Subscriber>(`/api/subscribers/${id}`)

export const createSubscriber = (body: NewSubscriber) => api.post<Subscriber>('/api/subscribers', body)

export const updateSubscriber = (id: number, body: NewSubscriber) =>
  api.put<Subscriber>(`/api/subscribers/${id}`, body)

export const deleteSubscriber = (id: number) => api.delete<boolean>(`/api/subscribers/${id}`)

export const sendOptin = (id: number) => api.post<boolean>(`/api/subscribers/${id}/optin`)

export const getSubscriberBounces = (id: number) => api.get<BounceRecord[]>(`/api/subscribers/${id}/bounces`)

export const deleteSubscriberBounces = (id: number) => api.delete<boolean>(`/api/subscribers/${id}/bounces`)

export const getSubscriberActivity = (id: number) => api.get<SubscriberActivity>(`/api/subscribers/${id}/activity`)

// Bulk actions: by IDs when rows are ticked, by filter when "select all N" is used.
export const deleteSubscribers = (ids: number[]) => api.delete<boolean>('/api/subscribers', { id: ids })

export const deleteSubscribersByQuery = (f: SubscriberFilter) =>
  api.post<boolean>('/api/subscribers/query/delete', {
    ...filterBody(f),
    // The backend rejects an empty search+query unless `all` is set (list filters still apply).
    all: !f.query?.trim() && !f.search?.trim(),
  })

export const blocklistSubscribers = (ids: number[]) => api.put<boolean>('/api/subscribers/blocklist', { ids })

export const blocklistSubscribersByQuery = (f: SubscriberFilter) =>
  api.put<boolean>('/api/subscribers/query/blocklist', filterBody(f))

export interface ListChange {
  action: 'add' | 'remove' | 'unsubscribe'
  targetListIds: number[]
  /** Mark added subscriptions as confirmed (skips the opt-in e-mail). */
  preconfirm: boolean
}

const listChangeBody = (c: ListChange): SubscriberBulkRequest => ({
  action: c.action,
  target_list_ids: c.targetListIds,
  status: c.preconfirm ? 'confirmed' : undefined,
})

export const changeSubscriberLists = (ids: number[], c: ListChange) =>
  api.put<boolean>('/api/subscribers/lists', { ...listChangeBody(c), ids })

export const changeSubscriberListsByQuery = (f: SubscriberFilter, c: ListChange) =>
  api.put<boolean>('/api/subscribers/query/lists', { ...filterBody(f), ...listChangeBody(c) })

/** Export is a streamed file download, so it's a plain navigation rather than an XHR. */
export function exportURL(f: SubscriberFilter, ids: number[] = []): string {
  const q = new URLSearchParams()
  if (f.query) q.append('query', f.query)
  else if (f.search) q.append('search', f.search)
  f.listIds?.forEach((id) => q.append('list_id', String(id)))
  if (f.subscriptionStatus) q.append('subscription_status', f.subscriptionStatus)
  ids.forEach((id) => q.append('id', String(id)))
  return `/api/subscribers/export?${q}`
}
