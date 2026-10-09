import { keepPreviousData, useMutation, useQuery } from '@tanstack/vue-query'
import { toValue, type MaybeRefOrGetter } from 'vue'
import * as api from '@/api/message-log'
import { keys } from './keys'

export const useMessageLog = (query: MaybeRefOrGetter<api.MessageLogQuery>) =>
  useQuery({
    queryKey: () => keys.messageLog.page(toValue(query)),
    queryFn: ({ signal }) => api.queryMessageLog(toValue(query), signal),
    placeholderData: keepPreviousData,
  })

export const useMessage = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.messageLog.detail(toValue(id)!),
    queryFn: () => api.getMessage(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

/** A sent message never changes, so its rendered email is fetched once. */
export const useMessagePreview = (id: MaybeRefOrGetter<number | undefined>, enabled: MaybeRefOrGetter<boolean> = true) =>
  useQuery({
    queryKey: () => keys.messageLog.preview(toValue(id)!),
    queryFn: () => api.previewMessage(toValue(id)!),
    enabled: () => toValue(id) !== undefined && toValue(enabled),
    staleTime: Infinity,
  })

export const useDeleteOldMessageLog = () => useMutation({ mutationFn: (before: string) => api.deleteOldMessageLog(before) })
