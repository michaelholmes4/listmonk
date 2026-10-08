import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { getProfile, logout, updateProfile } from '@/api/profile'
import { disableTOTP, enableTOTP, getTOTPSetup } from '@/api/users'
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

// A saved profile or 2FA change replaces the cached copy the shell and the profile page read.
export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (u) => qc.setQueryData(keys.profile, u),
  })
}

export function useTotp(userId: () => number) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: keys.profile })
  return {
    setup: useMutation({ mutationFn: () => getTOTPSetup(userId()) }),
    enable: useMutation({ mutationFn: (v: { secret: string; code: string }) => enableTOTP(userId(), v.secret, v.code), onSuccess: refresh }),
    disable: useMutation({ mutationFn: (password: string) => disableTOTP(userId(), password), onSuccess: refresh }),
  }
}
