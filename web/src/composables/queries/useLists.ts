import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { toValue, type MaybeRefOrGetter } from 'vue'
import * as api from '@/api/lists'
import type { NewList } from '@/api/types'
import { keys } from './keys'

/** All lists the user can see (no counts): feeds filters and pickers. */
export const useAllLists = () => useQuery({ queryKey: keys.lists.minimal, queryFn: api.getAllLists, staleTime: 60_000 })

export const useLists = (query: MaybeRefOrGetter<api.ListQuery>) =>
  useQuery({
    queryKey: () => keys.lists.page(toValue(query)),
    queryFn: ({ signal }) => api.queryLists(toValue(query), signal),
    placeholderData: keepPreviousData,
  })

export const useList = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.lists.detail(toValue(id)!),
    queryFn: () => api.getList(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

/** Any list change also refreshes the subscribers tree: rows there embed list names/counts. */
function useListMutation<TVars, TData>(fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.lists.all }),
        qc.invalidateQueries({ queryKey: keys.subscribers.all }),
      ]),
  })
}

export const useCreateList = () => useListMutation((b: NewList) => api.createList(b))

export const useUpdateList = () => useListMutation((v: { id: number; body: NewList }) => api.updateList(v.id, v.body))

export const useDeleteList = () => useListMutation((id: number) => api.deleteList(id))

/** Deletes by ID, or (when `filter` is given) every list matching that filter. Returns how many were deleted. */
export const useBulkDeleteLists = () =>
  useListMutation(async (t: { ids: number[] } | { filter: Omit<api.ListQuery, 'page' | 'perPage'> }) => {
    const ids = 'ids' in t ? t.ids : await api.getMatchingListIds(t.filter)
    await api.deleteLists(ids)
    return ids.length
  })

export const useCreateOptinCampaign = () =>
  useMutation({ mutationFn: (v: { list: { id: number; name: string }; t: (k: string, p: object) => string }) => api.createOptinCampaign(v.list, v.t) })
