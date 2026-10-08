import { api } from './client'
import type { User } from './types'

export const getProfile = () => api.get<User>('/api/profile')

export const logout = () => api.post<boolean>('/api/logout')

export type ProfileUpdate = { name: string; email?: string; password?: string; password2?: string }

export const updateProfile = (body: ProfileUpdate) => api.put<User>('/api/profile', body)
