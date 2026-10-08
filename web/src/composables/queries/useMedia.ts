import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { toValue, type MaybeRefOrGetter } from 'vue'
import * as api from '@/api/media'
import { keys } from './keys'

export const useMedia = (query: MaybeRefOrGetter<api.MediaQuery>) =>
  useQuery({
    queryKey: () => keys.media.page(toValue(query)),
    queryFn: ({ signal }) => api.queryMedia(toValue(query), signal),
    placeholderData: keepPreviousData,
  })

/**
 * Uploads files one request each (the API takes a single file per call). Every file is attempted;
 * if any failed, the mutation errors with a summary, after the successful ones are already saved.
 */
export const useUploadMedia = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const results = await Promise.allSettled(files.map((f) => api.uploadMedia(f)))
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed.length) {
        const first = failed[0].reason instanceof Error ? failed[0].reason.message : String(failed[0].reason)
        throw new Error(files.length === 1 ? first : `${failed.length}/${files.length}: ${first}`)
      }
      return results.length
    },
    // Refresh even when some failed: the others did upload.
    onSettled: () => qc.invalidateQueries({ queryKey: keys.media.all }),
  })
}

export const useDeleteMedia = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteMedia(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.media.all }),
  })
}
