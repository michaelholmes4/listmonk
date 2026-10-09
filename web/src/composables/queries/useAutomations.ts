import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { toValue, type MaybeRefOrGetter } from 'vue'
import * as api from '@/api/automations'
import type { AutomationGraph, AutomationSettings } from '@/api/types'
import { keys } from './keys'

export const useAutomations = (query: MaybeRefOrGetter<api.AutomationQuery>, enabled: MaybeRefOrGetter<boolean> = true) =>
  useQuery({
    queryKey: () => keys.automations.page(toValue(query)),
    queryFn: ({ signal }) => api.queryAutomations(toValue(query), signal),
    placeholderData: keepPreviousData,
    enabled: () => toValue(enabled),
  })

export const useAutomation = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.automations.detail(toValue(id)!),
    queryFn: () => api.getAutomation(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

/** The draft is edited locally and saved explicitly, so it is fetched once and never refetched under the editor. */
export const useAutomationDraft = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.automations.draft(toValue(id)!),
    queryFn: () => api.getDraft(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
    staleTime: Infinity,
    gcTime: 0,
  })

export const useAutomationVersions = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.automations.versions(toValue(id)!),
    queryFn: () => api.getVersions(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

/** Per-step counts, refreshed while the automation is live so the cards stay current. */
export const useNodeStats = (id: MaybeRefOrGetter<number | undefined>, live: MaybeRefOrGetter<boolean> = false) =>
  useQuery({
    queryKey: () => keys.automations.stats(toValue(id)!),
    queryFn: () => api.getNodeStats(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
    refetchInterval: () => (toValue(live) ? 5000 : false),
  })

export const useEnrollments = (id: MaybeRefOrGetter<number>, query: MaybeRefOrGetter<api.EnrollmentQuery>) =>
  useQuery({
    queryKey: () => keys.automations.enrollments(toValue(id), toValue(query)),
    queryFn: ({ signal }) => api.getEnrollments(toValue(id), toValue(query), signal),
    placeholderData: keepPreviousData,
    refetchInterval: 5000,
  })

export const useEnrollmentSteps = (id: MaybeRefOrGetter<number>, enrollmentId: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.automations.steps(toValue(id), toValue(enrollmentId)!),
    queryFn: () => api.getEnrollmentSteps(toValue(id), toValue(enrollmentId)!),
    enabled: () => toValue(enrollmentId) !== undefined,
  })

export const useSubscriberAutomations = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.automations.ofSubscriber(toValue(id)!),
    queryFn: () => api.getSubscriberAutomations(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

export const useSubscriberEvents = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.automations.eventsOf(toValue(id)!),
    queryFn: () => api.getSubscriberEvents(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

/** Everything about automations moves together (counts, status, versions), so mutations refresh the lot. */
function useAutomationMutation<TVars, TData>(fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: keys.automations.all }) })
}

export const useCreateAutomation = () => useAutomationMutation((b: { name: string }) => api.createAutomation(b))
export const useUpdateAutomation = () =>
  useAutomationMutation((v: { id: number; name: string; settings: AutomationSettings }) =>
    api.updateAutomation(v.id, { name: v.name, settings: v.settings }),
  )
export const useDeleteAutomation = () => useAutomationMutation((id: number) => api.deleteAutomation(id))
export const usePauseAutomation = () => useAutomationMutation((id: number) => api.pauseAutomation(id))
export const useResumeAutomation = () => useAutomationMutation((id: number) => api.resumeAutomation(id))
export const useArchiveAutomation = () => useAutomationMutation((id: number) => api.archiveAutomation(id))
export const usePublishAutomation = () =>
  useAutomationMutation((v: { id: number; enrollExisting: boolean }) => api.publishAutomation(v.id, v.enrollExisting))
export const useEnrollSubscribers = () =>
  useAutomationMutation((v: { id: number; subscriberIds: number[] }) => api.enrollSubscribers(v.id, v.subscriberIds))

/** Saving the draft does not touch the cached draft: the editor holds the working copy. */
export const useSaveDraft = () =>
  useMutation({ mutationFn: (v: { id: number; graph: AutomationGraph }) => api.saveDraft(v.id, v.graph) })

export const useCreateStepEmail = () => useMutation({ mutationFn: api.createStepEmail })

export const useUpdateStepEmail = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: number; body: Parameters<typeof api.updateStepEmail>[1] }) => api.updateStepEmail(v.id, v.body),
    onSuccess: (c) => qc.setQueryData(keys.campaigns.detail(c.id!), c),
  })
}
