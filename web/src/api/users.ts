import { api } from './client'
import type { NewUser, TOTPSetup, User } from './types'

export const getUsers = () => api.get<User[]>('/api/users')

export const getUser = (id: number) => api.get<User>(`/api/users/${id}`)

/** For an API user the response carries the one-time access token in `password`. */
export const createUser = (body: NewUser) => api.post<User>('/api/users', body)

export const updateUser = (id: number, body: NewUser) => api.put<User>(`/api/users/${id}`, body)

export const deleteUser = (id: number) => api.delete<boolean>(`/api/users/${id}`)

export const getTOTPSetup = (id: number) => api.get<TOTPSetup>(`/api/users/${id}/twofa/totp`)

export const enableTOTP = (id: number, secret: string, code: string) =>
  api.putForm<boolean>(`/api/users/${id}/twofa`, { secret, code })

export const disableTOTP = (id: number, password: string) => api.deleteForm<boolean>(`/api/users/${id}/twofa`, { password })
