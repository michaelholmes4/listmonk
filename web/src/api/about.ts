import { api } from './client'
import type { About } from './types'

// /api/about is one of the few endpoints that doesn't wrap its payload in {data: ...}.
export const getAbout = () => api.raw<About>('/api/about')
