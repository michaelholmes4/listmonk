import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { toValue, type MaybeRefOrGetter } from 'vue'
import * as api from '@/api/users'
import type { NewUser } from '@/api/types'
import { keys } from './keys'

export const useUsers = () => useQuery({ queryKey: keys.users.all, queryFn: api.getUsers })

export const useUser = (id: MaybeRefOrGetter<number | undefined>) =>
  useQuery({
    queryKey: () => keys.users.detail(toValue(id)!),
    queryFn: () => api.getUser(toValue(id)!),
    enabled: () => toValue(id) !== undefined,
  })

function useUserMutation<TVars, TData>(fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: keys.users.all }) })
}

export const useCreateUser = () => useUserMutation((b: NewUser) => api.createUser(b))
export const useUpdateUser = () => useUserMutation((v: { id: number; body: NewUser }) => api.updateUser(v.id, v.body))
export const useDeleteUser = () => useUserMutation((id: number) => api.deleteUser(id))
