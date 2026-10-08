import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { toValue, type MaybeRefOrGetter } from 'vue'
import * as api from '@/api/bounces'
import { blocklistSubscribers } from '@/api/subscribers'
import { keys } from './keys'

export const useBounces = (query: MaybeRefOrGetter<api.BounceQuery>) =>
  useQuery({
    queryKey: () => keys.bounces.page(toValue(query)),
    queryFn: ({ signal }) => api.queryBounces(toValue(query), signal),
    placeholderData: keepPreviousData,
  })

type Target = { ids: number[] } | { filter: Omit<api.BounceQuery, 'page' | 'perPage'> }

/** Bounce IDs, plus the (distinct) subscriber IDs behind them, for either kind of target. */
async function resolve(t: Target): Promise<{ bounceIds: number[]; subscriberIds: number[] }> {
  if ('filter' in t) {
    const rows = await api.getMatchingBounces(t.filter)
    return {
      bounceIds: rows.map((b) => b.id!),
      subscriberIds: [...new Set(rows.map((b) => b.subscriber_id!))],
    }
  }
  return { bounceIds: t.ids, subscriberIds: [] }
}

export const useDeleteBounces = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: Target) => {
      const { bounceIds } = await resolve(t)
      await api.deleteBounces(bounceIds)
      return bounceIds.length
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.bounces.all }),
        // A subscriber's bounce tab and the dashboard counts read the same rows.
        qc.invalidateQueries({ queryKey: keys.subscribers.all }),
      ]),
  })
}

/** Blocklists the subscribers behind the target bounces (by subscriber ID, never "all bounced"). */
export const useBlocklistBounced = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { subscriberIds: number[] } | { filter: Omit<api.BounceQuery, 'page' | 'perPage'> }) => {
      const ids = 'filter' in v ? (await resolve(v)).subscriberIds : v.subscriberIds
      await blocklistSubscribers(ids)
      return ids.length
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.bounces.all }),
        qc.invalidateQueries({ queryKey: keys.subscribers.all }),
      ]),
  })
}
