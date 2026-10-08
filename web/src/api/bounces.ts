import { api } from './client'
import type { BounceRecord, Paginated } from './types'

export interface BounceQuery {
  campaignId?: number
  source?: string
  page: number
  perPage: number | 'all'
  orderBy?: 'email' | 'campaign_name' | 'source' | 'type' | 'created_at'
  order?: 'asc' | 'desc'
}

export const queryBounces = (q: BounceQuery, signal?: AbortSignal) =>
  api.get<Paginated<BounceRecord>>(
    '/api/bounces',
    {
      campaign_id: q.campaignId || undefined,
      source: q.source || undefined,
      page: q.page,
      per_page: q.perPage,
      order_by: q.orderBy,
      order: q.order,
    },
    { signal },
  )

/**
 * Every bounce matching a filter, for "select all N". The backend's delete-all and
 * blocklist-all ignore filters (they act on everything), so the exact set is resolved here and
 * acted on by ID.
 */
export async function getMatchingBounces(q: Omit<BounceQuery, 'page' | 'perPage'>): Promise<BounceRecord[]> {
  return (await queryBounces({ ...q, page: 1, perPage: 'all' })).results
}

export const deleteBounce = (id: number) => api.delete<boolean>(`/api/bounces/${id}`)

export const deleteBounces = (ids: number[]) => api.delete<boolean>('/api/bounces', { id: ids })
