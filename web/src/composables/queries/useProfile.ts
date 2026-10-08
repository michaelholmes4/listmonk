import { useMutation, useQuery } from '@tanstack/vue-query'
import { getProfile, logout } from '@/api/profile'
import { loginURL } from '@/api/client'
import { keys } from './keys'

export const profileQuery = () => ({
  queryKey: keys.profile,
  queryFn: getProfile,
  staleTime: 5 * 60_000,
})

export const useProfile = () => useQuery(profileQuery())

export const useLogout = () =>
  useMutation({
    mutationFn: logout,
    onSuccess: () => window.location.assign(loginURL().split('?')[0]),
  })
