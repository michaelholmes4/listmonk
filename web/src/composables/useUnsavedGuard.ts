import { useEventListener } from '@vueuse/core'
import { ref, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

/**
 * Stops a page with unsaved edits from being left by accident: the browser's own prompt on
 * reload/close, and for in-app navigation a flag to show `LeaveConfirm` (resolve it with `decide`).
 * `busy` lets a save that is in flight (and navigates afterwards) through.
 */
export function useUnsavedGuard(dirty: Readonly<Ref<boolean>>, busy?: Readonly<Ref<boolean>>) {
  useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
    if (dirty.value) e.preventDefault()
  })

  const leaveOpen = ref(false)
  let decision: ((ok: boolean) => void) | undefined
  onBeforeRouteLeave(() => {
    if (!dirty.value || busy?.value) return true
    leaveOpen.value = true
    return new Promise<boolean>((resolve) => (decision = resolve))
  })
  function decide(ok: boolean) {
    leaveOpen.value = false
    decision?.(ok)
  }
  return { leaveOpen, decide }
}
