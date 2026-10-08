import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { toValue, type MaybeRefOrGetter } from 'vue'
import * as api from '@/api/templates'
import type { NewTemplate } from '@/api/types'
import { keys } from './keys'

export const useTemplates = () =>
  useQuery({ queryKey: [...keys.templates.all, 'list'], queryFn: api.getTemplates, staleTime: 30_000 })

export const useTemplate = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.templates.detail(toValue(id)!),
    queryFn: () => api.getTemplate(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

function useTemplateMutation<TVars, TData>(fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: keys.templates.all }) })
}

export const useCreateTemplate = () => useTemplateMutation((b: NewTemplate) => api.createTemplate(b))
export const useUpdateTemplate = () =>
  useTemplateMutation((v: { id: number; body: Partial<NewTemplate> }) => api.updateTemplate(v.id, v.body))
export const useDeleteTemplate = () => useTemplateMutation((id: number) => api.deleteTemplate(id))
export const useMakeTemplateDefault = () => useTemplateMutation((id: number) => api.makeTemplateDefault(id))

/** Renders a preview on demand; the caller shows `data` in a PreviewDialog. */
export const usePreviewTemplate = () =>
  useMutation({
    mutationFn: (v: { id: number } | { type: string; body: string }) =>
      'id' in v ? api.previewTemplate(v.id) : api.previewTemplateBody(v.type, v.body),
  })
