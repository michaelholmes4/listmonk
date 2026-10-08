import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { toValue, type MaybeRefOrGetter } from 'vue'
import * as api from '@/api/subscribers'
import type { NewSubscriber } from '@/api/types'
import { keys } from './keys'

export const useSubscribers = (query: MaybeRefOrGetter<api.SubscriberQuery>) =>
  useQuery({
    queryKey: () => keys.subscribers.page(toValue(query)),
    queryFn: ({ signal }) => api.getSubscribers(toValue(query), signal),
    // Keep the previous page on screen while the next one loads: the table never blanks.
    placeholderData: keepPreviousData,
  })

export const useSubscriber = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.subscribers.detail(toValue(id)!),
    queryFn: () => api.getSubscriber(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

export const useSubscriberActivity = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.subscribers.activity(toValue(id)!),
    queryFn: () => api.getSubscriberActivity(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

export const useSubscriberBounces = (id: MaybeRefOrGetter<number | undefined>, enabled: MaybeRefOrGetter<boolean>) =>
  useQuery({
    queryKey: () => keys.subscribers.bounces(toValue(id)!),
    queryFn: () => api.getSubscriberBounces(toValue(id)!),
    enabled: () => toValue(id) !== undefined && toValue(enabled),
  })

/**
 * Every subscriber mutation invalidates the whole `subscribers` tree (pages, details, counts),
 * and `lists` too, because list rows show subscriber counts. Errors are toasted globally
 * (see lib/query-client.ts); success toasts are the caller's call.
 */
function useSubscriberMutation<TVars, TData>(fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.subscribers.all }),
        qc.invalidateQueries({ queryKey: keys.lists.all }),
      ]),
  })
}

export const useCreateSubscriber = () => useSubscriberMutation((b: NewSubscriber) => api.createSubscriber(b))

export const useUpdateSubscriber = () =>
  useSubscriberMutation((v: { id: number; body: NewSubscriber }) => api.updateSubscriber(v.id, v.body))

export const useDeleteSubscriber = () => useSubscriberMutation((id: number) => api.deleteSubscriber(id))

export const useSendOptin = () => useMutation({ mutationFn: (id: number) => api.sendOptin(id) })

export const useDeleteSubscriberBounces = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteSubscriberBounces(id),
    onSuccess: (_d, id) => qc.invalidateQueries({ queryKey: keys.subscribers.bounces(id) }),
  })
}

/** Bulk actions take either explicit IDs or the active filter ("select all N"). */
export type BulkTarget = { ids: number[] } | { filter: api.SubscriberFilter }

export const useBulkDelete = () =>
  useSubscriberMutation((t: BulkTarget) =>
    'ids' in t ? api.deleteSubscribers(t.ids) : api.deleteSubscribersByQuery(t.filter),
  )

export const useBulkBlocklist = () =>
  useSubscriberMutation((t: BulkTarget) =>
    'ids' in t ? api.blocklistSubscribers(t.ids) : api.blocklistSubscribersByQuery(t.filter),
  )

export const useBulkChangeLists = () =>
  useSubscriberMutation((v: { target: BulkTarget; change: api.ListChange }) =>
    'ids' in v.target
      ? api.changeSubscriberLists(v.target.ids, v.change)
      : api.changeSubscriberListsByQuery(v.target.filter, v.change),
  )
