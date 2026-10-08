import { useQuery } from '@tanstack/vue-query'
import { getLogs } from '@/api/settings'
import { keys } from './keys'

/** The server's in-memory log buffer, refreshed every 10 seconds while the page is open. */
export const useLogs = () => useQuery({ queryKey: keys.logs, queryFn: getLogs, refetchInterval: 10_000, staleTime: 0 })
