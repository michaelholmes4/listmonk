import { api } from './client'
import type { ListRole, NewListRole, NewRole, Role } from './types'

export const getUserRoles = () => api.get<Role[]>('/api/roles/users')
export const createUserRole = (body: NewRole) => api.post<Role>('/api/roles/users', body)
export const updateUserRole = (id: number, body: NewRole) => api.put<Role>(`/api/roles/users/${id}`, body)

export const getListRoles = () => api.get<ListRole[]>('/api/roles/lists')
export const createListRole = (body: NewListRole) => api.post<ListRole>('/api/roles/lists', body)
export const updateListRole = (id: number, body: NewListRole) => api.put<ListRole>(`/api/roles/lists/${id}`, body)

/** User and list roles share the delete route. */
export const deleteRole = (id: number) => api.delete<boolean>(`/api/roles/${id}`)
