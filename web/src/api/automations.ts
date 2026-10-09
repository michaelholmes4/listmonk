import { api, ApiError } from './client'
import type {
  Automation,
  AutomationEnrollment,
  AutomationEvent,
  AutomationGraph,
  AutomationNodeStat,
  AutomationProblem,
  AutomationRow,
  AutomationSettings,
  AutomationStatus,
  AutomationStep,
  AutomationVersion,
  Campaign,
  EnrollmentStatus,
  NewCampaign,
  Paginated,
  SubscriberAutomation,
} from './types'

export interface AutomationQuery {
  query?: string
  status?: AutomationStatus[]
  /** Only those whose published version takes people added by hand. */
  manual?: boolean
  page: number
  perPage: number | 'all'
  orderBy?: 'name' | 'status' | 'created_at' | 'updated_at'
  order?: 'asc' | 'desc'
}

export const queryAutomations = (q: AutomationQuery, signal?: AbortSignal) =>
  api.get<Paginated<AutomationRow>>(
    '/api/automations',
    { query: q.query || undefined, status: q.status, manual: q.manual || undefined, page: q.page, per_page: q.perPage, order_by: q.orderBy, order: q.order },
    { signal },
  )

export const getAutomation = (id: number) => api.get<Automation>(`/api/automations/${id}`)

export const createAutomation = (b: { name: string; settings?: AutomationSettings }) =>
  api.post<Automation>('/api/automations', { settings: {}, ...b })

export const updateAutomation = (id: number, b: { name: string; settings: AutomationSettings }) =>
  api.put<Automation>(`/api/automations/${id}`, b)

export const deleteAutomation = (id: number) => api.delete<boolean>(`/api/automations/${id}`)

export const getDraft = (id: number) => api.get<AutomationVersion>(`/api/automations/${id}/draft`)

export const saveDraft = (id: number, graph: AutomationGraph) =>
  api.put<{ version: AutomationVersion; problems: AutomationProblem[] }>(`/api/automations/${id}/draft`, graph)

/** Why publishing was refused: the server answers 400 with every problem found. */
export class PublishError extends ApiError {
  readonly problems: AutomationProblem[]

  constructor(message: string, problems: AutomationProblem[]) {
    super(message, 400)
    this.problems = problems
  }
}

const problemsOf = (e: unknown): AutomationProblem[] | undefined =>
  e instanceof ApiError && e.status === 400 ? (e.data as { problems?: AutomationProblem[] } | undefined)?.problems : undefined

export async function publishAutomation(id: number, enrollExisting: boolean) {
  try {
    return await api.post<{ automation: Automation; version: AutomationVersion }>(`/api/automations/${id}/publish`, {
      enroll_existing: enrollExisting,
    })
  } catch (e) {
    const problems = problemsOf(e)
    if (problems) throw new PublishError((e as Error).message, problems)
    throw e
  }
}

export const pauseAutomation = (id: number) => api.post<Automation>(`/api/automations/${id}/pause`)
export const resumeAutomation = (id: number) => api.post<Automation>(`/api/automations/${id}/resume`)
export const archiveAutomation = (id: number) => api.post<Automation>(`/api/automations/${id}/archive`)

export const enrollSubscribers = (id: number, subscriberIds: number[]) =>
  api.post<{ enrolled: number }>(`/api/automations/${id}/enroll`, { subscriber_ids: subscriberIds })

export const getVersions = (id: number) => api.get<AutomationVersion[]>(`/api/automations/${id}/versions`)

export interface EnrollmentQuery {
  status?: EnrollmentStatus[]
  query?: string
  page: number
  perPage: number
}

export const getEnrollments = (id: number, q: EnrollmentQuery, signal?: AbortSignal) =>
  api.get<Paginated<AutomationEnrollment>>(
    `/api/automations/${id}/enrollments`,
    { status: q.status, query: q.query || undefined, page: q.page, per_page: q.perPage },
    { signal },
  )

export const getEnrollmentSteps = (id: number, enrollmentId: number) =>
  api.get<AutomationStep[]>(`/api/automations/${id}/enrollments/${enrollmentId}/steps`)

export const getNodeStats = (id: number) => api.get<AutomationNodeStat[]>(`/api/automations/${id}/stats`)

export interface NewStepEmail {
  name: string
  subject?: string
  list_id?: number
  content_type?: string
  body?: string
}

/** Creates the hidden campaign that holds a new email step's content. */
export const createStepEmail = (b: NewStepEmail) =>
  api.post<{ campaign_id: number }>('/api/automations/emails', b).then((r) => r.campaign_id)

/** Updates an email step's content. Same fields as a campaign update, but no lists: the step sets those. */
export const updateStepEmail = (id: number, b: Omit<NewCampaign, 'lists'>) => api.put<Campaign>(`/api/automations/emails/${id}`, b)

export const getSubscriberAutomations = (subscriberId: number) =>
  api.get<SubscriberAutomation[]>(`/api/subscribers/${subscriberId}/automations`)

export const getSubscriberEvents = (subscriberId: number, page = 1, perPage = 20) =>
  api.get<Paginated<AutomationEvent>>(`/api/subscribers/${subscriberId}/events`, { page, per_page: perPage })

export const deleteOldEvents = (beforeDate: string) =>
  api.delete<{ deleted: number }>('/api/maintenance/events', { before_date: beforeDate })
