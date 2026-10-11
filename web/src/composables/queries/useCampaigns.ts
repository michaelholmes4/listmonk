import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import * as api from '@/api/campaigns'
import type { Campaign, NewCampaign } from '@/api/types'
import { keys } from './keys'

export const useCampaigns = (query: MaybeRefOrGetter<api.CampaignQuery>) =>
  useQuery({
    queryKey: () => keys.campaigns.page(toValue(query)),
    queryFn: ({ signal }) => api.queryCampaigns(toValue(query), signal),
    placeholderData: keepPreviousData,
  })

export const useCampaign = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.campaigns.detail(toValue(id)!),
    queryFn: () => api.getCampaign(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

/**
 * Several campaigns by id, as a map (each one shares the cache of its `useCampaign`). Silent: for
 * labels that can do without, so a missing permission shows no toast.
 */
export const useCampaignsById = (ids: MaybeRefOrGetter<number[]>) =>
  useQueries({
    queries: computed(() =>
      toValue(ids).map((id) => ({ queryKey: keys.campaigns.detail(id), queryFn: () => api.getCampaign(id), meta: { silent: true } })),
    ),
    combine: (results) => new Map(results.flatMap((r) => (r.data ? [[r.data.id!, r.data] as const] : []))),
  })

/**
 * Progress of running campaigns, polled every second while any is running. The list merges it over
 * its (static) rows; when the last run ends the list is refetched so the final numbers show.
 */
export const useRunningStats = (enabled: MaybeRefOrGetter<boolean> = true) => {
  const qc = useQueryClient()
  return useQuery({
    queryKey: keys.campaigns.running,
    queryFn: async () => {
      const prev = qc.getQueryData<unknown[]>(keys.campaigns.running)
      const next = await api.getRunningStats()
      if (prev?.length && !next.length) await qc.invalidateQueries({ queryKey: keys.campaigns.all })
      return next
    },
    enabled: () => toValue(enabled),
    refetchInterval: (q) => (q.state.data?.length ? 1000 : false),
  })
}

/** Campaigns, their running stats and the dashboard counts all move together. */
function useCampaignMutation<TVars, TData>(fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.campaigns.all }),
        qc.invalidateQueries({ queryKey: keys.dashboard.counts }),
      ]),
  })
}

export const useCreateCampaign = () => useCampaignMutation((b: NewCampaign) => api.createCampaign(b))
export const useUpdateCampaign = () =>
  useCampaignMutation((v: { id: number; body: NewCampaign }) => api.updateCampaign(v.id, v.body))
export const useChangeCampaignStatus = () =>
  useCampaignMutation((v: { id: number; status: api.CampaignStatus }) => api.changeCampaignStatus(v.id, v.status))
export const useDeleteCampaign = () => useCampaignMutation((id: number) => api.deleteCampaign(id))

/** Deletes by ID, or (with `filter`) every campaign matching it. Returns how many were deleted. */
export const useBulkDeleteCampaigns = () =>
  useCampaignMutation(async (t: { ids: number[] } | { filter: Omit<api.CampaignQuery, 'page' | 'perPage'> }) => {
    const ids = 'ids' in t ? t.ids : await api.getMatchingCampaignIds(t.filter)
    await api.deleteCampaigns(ids)
    return ids.length
  })

export const usePreviewCampaign = () => useMutation({ mutationFn: (id: number) => api.previewCampaign(id) })

/**
 * Cloning copies everything but the name, and fetches the body first (list rows don't carry it).
 * A scheduled copy keeps its time only if still in the future, else it moves a week ahead.
 */
export function useCloneCampaign() {
  return useCampaignMutation(async (v: { source: Campaign; name: string }) => {
    const full = await api.getCampaign(v.source.id!)
    const now = new Date()
    const sendLater = !!full.send_at
    const sendAt = sendLater ? (new Date(full.send_at!) > now ? full.send_at! : new Date(now.getTime() + 7 * 86400_000).toISOString()) : null
    return api.createCampaign({
      name: v.name,
      subject: full.subject ?? '',
      lists: (full.lists ?? []).map((l) => l.id!),
      type: full.type,
      from_email: full.from_email,
      content_type: full.content_type,
      messenger: full.messenger,
      tags: full.tags,
      template_id: full.template_id ?? undefined,
      body: full.body,
      body_source: full.body_source ?? undefined,
      altbody: full.altbody ?? undefined,
      headers: full.headers,
      send_later: sendLater,
      send_at: sendAt,
      archive: full.archive,
      archive_template_id: full.archive_template_id ?? undefined,
      archive_meta: full.archive_meta,
      media: (full.media ?? []).map((m) => m.id!),
      ...(full.archive ? { archive_slug: `${v.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}` } : {}),
    })
  })
}

/** Preview of what is in the editor right now (unsaved), not of the saved campaign. */
export const usePreviewCampaignBody = () =>
  useMutation({ mutationFn: (v: { id: number; contentType: string; body: string; templateId: number | null }) => api.previewCampaignBody(v.id, v) })

export const usePreviewCampaignArchive = () =>
  useMutation({ mutationFn: (v: { id: number; archiveMeta: string; templateId: number | null }) => api.previewCampaignArchive(v.id, v) })

export const useTestCampaign = () =>
  useMutation({ mutationFn: (v: { id: number; body: NewCampaign; subscribers: string[] }) => api.testCampaign(v.id, v.body, v.subscribers) })

export const useConvertCampaignContent = () =>
  useMutation({ mutationFn: (v: { body: string; from: string; to: string }) => api.convertCampaignContent(v.body, v.from, v.to) })

export const useUpdateCampaignArchive = () =>
  useCampaignMutation((v: { id: number; body: api.ArchiveUpdate }) => api.updateCampaignArchive(v.id, v.body))

/** One query per metric, so each chart loads (and fails) on its own. */
export const useCampaignAnalytics = (type: api.AnalyticsType, range: MaybeRefOrGetter<api.AnalyticsRange | undefined>) =>
  useQuery({
    queryKey: () => ['campaigns', 'analytics', type, toValue(range)?.ids, toValue(range)?.from, toValue(range)?.to],
    queryFn: () => api.getAnalytics(type, toValue(range)!),
    enabled: () => !!toValue(range)?.ids.length,
  })

export const useCampaignLinks = (range: MaybeRefOrGetter<api.AnalyticsRange | undefined>) =>
  useQuery({
    queryKey: () => ['campaigns', 'analytics', 'links', toValue(range)?.ids, toValue(range)?.from, toValue(range)?.to],
    queryFn: () => api.getAnalyticsLinks(toValue(range)!),
    enabled: () => !!toValue(range)?.ids.length,
  })
