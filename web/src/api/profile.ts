import { api } from './client'
import type { User } from './types'

export const getProfile = () => api.get<User>('/api/profile')

export const logout = () => api.post<boolean>('/api/logout')
