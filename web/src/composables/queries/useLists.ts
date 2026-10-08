import { useQuery } from '@tanstack/vue-query'
import { getAllLists } from '@/api/lists'
import { keys } from './keys'

/** All lists the user can see (no counts): feeds filters and pickers. */
export const useAllLists = () => useQuery({ queryKey: keys.lists.minimal, queryFn: getAllLists, staleTime: 60_000 })
