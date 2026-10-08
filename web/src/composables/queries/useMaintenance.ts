import { useMutation } from '@tanstack/vue-query'
import * as api from '@/api/maintenance'

// Deleting subscribers changes counts everywhere; the dashboard and lists refetch on next visit.
export const useDeleteSubscribers = () => useMutation({ mutationFn: (type: api.OrphanType) => api.deleteSubscribers(type) })
export const useDeleteUnconfirmedSubscriptions = () =>
  useMutation({ mutationFn: (beforeDate: string) => api.deleteUnconfirmedSubscriptions(beforeDate) })
export const useDeleteAnalytics = () =>
  useMutation({ mutationFn: (v: { type: api.AnalyticsType; beforeDate: string }) => api.deleteAnalytics(v.type, v.beforeDate) })
