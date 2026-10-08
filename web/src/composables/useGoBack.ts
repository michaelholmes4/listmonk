import { useRouter, type RouteLocationRaw } from 'vue-router'

/**
 * Leaves a form page. When the user came from inside the app, go back in history so the list
 * they were on keeps its search, filters and page; otherwise (deep link, reload) go to `fallback`.
 * vue-router records the previous in-app location (without the base path) in `history.state.back`;
 * it is null on the first page of a session.
 */
export function useGoBack(fallback: RouteLocationRaw) {
  const router = useRouter()
  return () => {
    const back = (window.history.state as { back?: string | null } | null)?.back
    if (back) router.back()
    else router.push(fallback)
  }
}
