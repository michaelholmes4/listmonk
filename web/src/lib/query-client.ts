import { MutationCache, QueryCache, QueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'
import { ApiError } from '@/api/client'

declare module '@tanstack/vue-query' {
  interface Register {
    queryMeta: { /** Don't toast when this query fails. */ silent?: boolean }
    mutationMeta: { /** Toast shown on success. */ success?: string; silent?: boolean }
  }
}

// Redirecting to login is already underway when unauthenticated; a toast would just flash.
const fail = (err: unknown) => {
  if (err instanceof ApiError && err.unauthenticated) return
  toast.error(err instanceof Error ? err.message : String(err))
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (!query.meta?.silent) fail(err)
    },
  }),
  // Every mutation reports its outcome through a toast.
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (!mutation.meta?.silent) fail(err)
    },
    onSuccess: (_data, _vars, _ctx, mutation) => {
      if (mutation.meta?.success) toast.success(mutation.meta.success)
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500 && err.status !== 0) && count < 2,
    },
  },
})
