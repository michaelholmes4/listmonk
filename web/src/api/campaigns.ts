import { api } from './client'
import type { AnalyticsCount, AnalyticsLink, Campaign, CampaignStats, NewCampaign, Paginated } from './types'

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'cancelled' | 'finished'

export interface CampaignQuery {
  query?: string
  status?: CampaignStatus
  page: number
  perPage: number | 'all'
  orderBy?: 'name' | 'status' | 'created_at' | 'updated_at'
  order?: 'asc' | 'desc'
}

// Names are matched with a text search; punctuation only produces errors.
const cleanQuery = (q?: string) => (q ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim()

/** List rows leave the (large) bodies out; the edit page fetches the one it needs. */
export const queryCampaigns = (q: CampaignQuery, signal?: AbortSignal) =>
  api.get<Paginated<Campaign>>(
    '/api/campaigns',
    {
      query: cleanQuery(q.query) || undefined,
      status: q.status,
      page: q.page,
      per_page: q.perPage,
      order_by: q.orderBy,
      order: q.order,
      no_body: true,
    },
    { signal },
  )

/** Every campaign matching a filter, for "select all N" (resolved to IDs, see lists.ts). */
export async function getMatchingCampaignIds(q: Omit<CampaignQuery, 'page' | 'perPage'>): Promise<number[]> {
  return (await queryCampaigns({ ...q, page: 1, perPage: 'all' })).results.map((c) => c.id!)
}

export const getCampaign = (id: number) => api.get<Campaign>(`/api/campaigns/${id}`)

export const createCampaign = (body: NewCampaign) => api.post<Campaign>('/api/campaigns', body)

export const updateCampaign = (id: number, body: NewCampaign) => api.put<Campaign>(`/api/campaigns/${id}`, body)

export const changeCampaignStatus = (id: number, status: CampaignStatus) =>
  api.put<Campaign>(`/api/campaigns/${id}/status`, { status })

export const deleteCampaign = (id: number) => api.delete<boolean>(`/api/campaigns/${id}`)

export const deleteCampaigns = (ids: number[]) => api.delete<boolean>('/api/campaigns', { id: ids })

/** Live progress of running campaigns; an empty list when none are running. */
export const getRunningStats = () => api.get<CampaignStats[]>('/api/campaigns/running/stats')

/** Rendered HTML of a saved campaign, as subscribers would get it. */
export const previewCampaign = (id: number) => api.html(`/api/campaigns/${id}/preview`)

/** Preview of unsaved content: the body/template/type currently in the editor. */
export const previewCampaignBody = (id: number, v: { contentType: string; body: string; templateId: number | null }) =>
  api.postFormForHTML(`/api/campaigns/${id}/preview`, {
    content_type: v.contentType,
    body: v.body,
    template_id: v.templateId ? String(v.templateId) : '',
  })

/** Preview of the public archive page, with the (unsaved) archive template and sample subscriber data. */
export const previewCampaignArchive = (id: number, v: { archiveMeta: string; templateId: number | null }) =>
  api.postFormForHTML(`/api/campaigns/${id}/preview/archive`, {
    archive_meta: v.archiveMeta,
    template_id: v.templateId ? String(v.templateId) : '',
  })

/** Sends the campaign as it is in the editor (unsaved changes included) to a few addresses. */
export const testCampaign = (id: number, body: NewCampaign, subscribers: string[]) =>
  api.post<boolean>(`/api/campaigns/${id}/test`, { ...body, subscribers })

/** Server-side content conversion (markdown to HTML). Returns the converted body. */
export const convertCampaignContent = (body: string, from: string, to: string) =>
  api.post<string>('/api/campaigns/1/content', { id: 1, body, from, to })

export interface ArchiveUpdate {
  archive: boolean
  archive_template_id?: number
  archive_meta?: Record<string, unknown>
  archive_slug?: string
}

/** Changes only the archive settings; allowed even when the campaign's content is locked. */
export const updateCampaignArchive = (id: number, body: ArchiveUpdate) =>
  api.put<ArchiveUpdate>(`/api/campaigns/${id}/archive`, body)

export type AnalyticsType = 'views' | 'clicks' | 'bounces'

export interface AnalyticsRange {
  ids: number[]
  from: Date
  to: Date
}

/** Counts over time, one series per campaign. */
export const getAnalytics = (type: AnalyticsType, r: AnalyticsRange) =>
  api.get<AnalyticsCount[]>(`/api/campaigns/analytics/${type}`, { id: r.ids, from: r.from.toISOString(), to: r.to.toISOString() })

/** Clicks per link, summed over the campaigns. */
export const getAnalyticsLinks = (r: AnalyticsRange) =>
  api.get<AnalyticsLink[]>('/api/campaigns/analytics/links', { id: r.ids, from: r.from.toISOString(), to: r.to.toISOString() })
