import { computed, type WritableComputedRef } from 'vue'
import { useRoute, useRouter, type LocationQuery, type RouteParams } from 'vue-router'

/**
 * List-page state (search, page, sort) kept in the URL query, so it survives going to an edit
 * page and back, a reload, and can be shared. `names` are the route names this list lives on:
 * while the user is navigating to a different page the component is still mounted for a moment,
 * and without this guard it would read that page's (empty) query and refetch with defaults.
 */
export function useUrlState(names: string[]) {
  const route = useRoute()
  const router = useRouter()

  let last: LocationQuery = { ...route.query }
  let lastParams: RouteParams = { ...route.params }
  const active = () => names.includes(route.name as string)
  const query = computed(() => {
    if (active()) last = { ...route.query }
    return last
  })
  /** Path params (e.g. the list id) with the same guard. */
  const params = computed(() => {
    if (active()) lastParams = { ...route.params }
    return lastParams
  })

  // Several keys are often set together (page + size); merge into one navigation.
  function set(changes: Record<string, string | number | undefined>) {
    const next: Record<string, unknown> = { ...query.value }
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined || v === '') delete next[k]
      else next[k] = String(v)
    }
    last = next as LocationQuery
    router.replace({ query: next as LocationQuery })
  }

  const str = (key: string, def = ''): WritableComputedRef<string> =>
    computed({
      get: () => (query.value[key] as string | undefined) ?? def,
      set: (v) => set({ [key]: v === def ? undefined : v }),
    })

  const int = (key: string, def: number): number => {
    const n = Number(query.value[key])
    return Number.isInteger(n) && n > 0 ? n : def
  }

  return { query, params, set, str, int }
}
