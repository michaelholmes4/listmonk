import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { getSettings } from '@/api/settings'
import { usePermission } from '../usePermission'
import { keys } from './keys'

/**
 * Whether slow queries are cached (so some counts lag). Only people who may read the settings can
 * tell; for everyone else the note is simply not shown, as in the classic UI.
 */
export function useSlowQueriesCached() {
  const { can } = usePermission()
  const { data } = useQuery({
    queryKey: [...keys.settings, 'slow-queries'],
    queryFn: async () => !!(await getSettings())['app.cache_slow_queries'],
    enabled: () => can('settings:get'),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  })
  return computed(() => !!data.value)
}
