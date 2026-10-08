import { api } from './client'
import type { NewTemplate, Template } from './types'

/** Lists leave the (large) bodies out; the edit page fetches the one it needs. */
export const getTemplates = () => api.get<Template[]>('/api/templates', { no_body: true })

export const getTemplate = (id: number) => api.get<Template>(`/api/templates/${id}`)

export const createTemplate = (body: NewTemplate) => api.post<Template>('/api/templates', body)

export const updateTemplate = (id: number, body: Partial<NewTemplate>) => api.put<Template>(`/api/templates/${id}`, body)

export const deleteTemplate = (id: number) => api.delete<boolean>(`/api/templates/${id}`)

export const makeTemplateDefault = (id: number) => api.put<Template>(`/api/templates/${id}/default`)

/** Rendered HTML of a saved template, with dummy content. */
export const previewTemplate = (id: number) => api.html(`/api/templates/${id}/preview`)

/** Rendered HTML of an unsaved body (what the form currently holds). */
export const previewTemplateBody = (type: string, body: string) =>
  api.postFormForHTML('/api/templates/preview', { template_type: type, body })
