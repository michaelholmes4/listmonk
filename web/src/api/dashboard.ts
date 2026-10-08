import { api } from './client'
import type { DashboardCount } from './types'

export const getDashboardCounts = () => api.get<DashboardCount>('/api/dashboard/counts')
