import { useQuery } from '@tanstack/vue-query'
import { getDashboardCounts } from '@/api/dashboard'
import { keys } from './keys'

export const useDashboardCounts = () => useQuery({ queryKey: keys.dashboard.counts, queryFn: getDashboardCounts })
