import { api } from './client'
import type { DashboardChart, DashboardCount } from './types'

export const getDashboardCounts = () => api.get<DashboardCount>('/api/dashboard/counts')

export const getDashboardCharts = () => api.get<DashboardChart>('/api/dashboard/charts')
