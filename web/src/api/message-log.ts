import { api } from './client'
import type { MessageLogEntry, MessageLogRow, Paginated } from './types'

export type MessageStatus = 'sent' | 'failed' | 'bounced'
export type MessageSource = 'campaign' | 'automation' | 'tx' | 'notification' | 'system'

export interface MessageLogQuery {
  query?: string
  status?: MessageStatus
  source?: MessageSource
  subscriberId?: number
  campaignId?: number
  automationId?: number
  /** ISO timestamp: only messages from then on. */
  since?: string
  page: number
  perPage: number | 'all'
  order?: 'asc' | 'desc'
}

export const queryMessageLog = (q: MessageLogQuery, signal?: AbortSignal) =>
  api.get<Paginated<MessageLogRow>>(
    '/api/message-log',
    {
      query: q.query || undefined,
      status: q.status,
      source: q.source,
      subscriber_id: q.subscriberId,
      campaign_id: q.campaignId,
      automation_id: q.automationId,
      since: q.since,
      order: q.order,
      page: q.page,
      per_page: q.perPage,
    },
    { signal },
  )

export const getMessage = (id: number) => api.get<MessageLogEntry>(`/api/message-log/${id}`)

/** The email as HTML: the stored copy, or the campaign's re-rendered for that subscriber. */
export const previewMessage = (id: number) => api.html(`/api/message-log/${id}/preview`)

export const deleteOldMessageLog = (beforeDate: string) =>
  api.delete<{ deleted: number }>('/api/maintenance/message-log', { before_date: beforeDate })
