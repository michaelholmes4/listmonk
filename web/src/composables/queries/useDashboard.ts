import { useQuery } from '@tanstack/vue-query'
import { getDashboardCharts, getDashboardCounts } from '@/api/dashboard'
import { keys } from './keys'

// Counts and charts are separate queries so each card loads (and fails) on its own.
export const useDashboardCounts = () => useQuery({ queryKey: keys.dashboard.counts, queryFn: getDashboardCounts })

export const useDashboardCharts = () => useQuery({ queryKey: keys.dashboard.charts, queryFn: getDashboardCharts })
