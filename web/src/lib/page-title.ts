import { onScopeDispose, ref, toValue, watchEffect, type MaybeRefOrGetter } from 'vue'

/** The document title from index.html, e.g. "listmonk". Page titles are prefixed to it. */
export const baseTitle = document.title

/** Set by detail pages so the breadcrumb and tab title show the object's name, not the route's. */
export const dynamicTitle = ref<string | null>(null)

/**
 * Names the current page after the object it shows (a list, a subscriber...). Pass a getter so
 * it updates once the data has loaded; until then the route's static title is shown.
 */
export function usePageTitle(title: MaybeRefOrGetter<string | undefined | null>) {
  watchEffect(() => {
    const t = toValue(title)
    dynamicTitle.value = t || null
    if (t) document.title = `${t} · ${baseTitle}`
  })
  onScopeDispose(() => {
    dynamicTitle.value = null
  })
}
