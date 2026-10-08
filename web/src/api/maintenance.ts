import { api } from './client'

export type OrphanType = 'orphan' | 'blocklisted'
export type AnalyticsType = 'all' | 'views' | 'clicks'

export const deleteSubscribers = (type: OrphanType) =>
  api.delete<{ count: number }>(`/api/maintenance/subscribers/${type}`)

export const deleteUnconfirmedSubscriptions = (beforeDate: string) =>
  api.delete<{ count: number }>('/api/maintenance/subscriptions/unconfirmed', { before_date: beforeDate })

export const deleteAnalytics = (type: AnalyticsType, beforeDate: string) =>
  api.delete<boolean>(`/api/maintenance/analytics/${type}`, { before_date: beforeDate })

/** The CSV is a plain download, so this is a link, not a request. */
export const analyticsExportURL = (type: 'views' | 'clicks', since: string) =>
  `/api/maintenance/analytics/${type}/export?since=${encodeURIComponent(since)}`
