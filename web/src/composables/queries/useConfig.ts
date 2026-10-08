import { useQuery } from '@tanstack/vue-query'
import { getServerConfig } from '@/api/config'
import { keys } from './keys'

export const configQuery = () => ({
  queryKey: keys.config,
  queryFn: getServerConfig,
  staleTime: Infinity,
})

export const useConfig = () => useQuery(configQuery())
