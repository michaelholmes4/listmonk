import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import * as api from '@/api/roles'
import type { NewListRole, NewRole } from '@/api/types'
import { keys } from './keys'

export const useUserRoles = () => useQuery({ queryKey: keys.roles.users, queryFn: api.getUserRoles })
export const useListRoles = () => useQuery({ queryKey: keys.roles.lists, queryFn: api.getListRoles })

// Roles are shown on users (and a role's permissions on the profile), so any change refreshes those too.
function useRoleMutation<TVars, TData>(fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['roles'] }), qc.invalidateQueries({ queryKey: keys.users.all })]),
  })
}

export const useCreateUserRole = () => useRoleMutation((b: NewRole) => api.createUserRole(b))
export const useUpdateUserRole = () => useRoleMutation((v: { id: number; body: NewRole }) => api.updateUserRole(v.id, v.body))
export const useCreateListRole = () => useRoleMutation((b: NewListRole) => api.createListRole(b))
export const useUpdateListRole = () => useRoleMutation((v: { id: number; body: NewListRole }) => api.updateListRole(v.id, v.body))
export const useDeleteRole = () => useRoleMutation((id: number) => api.deleteRole(id))
