import { computed, ref } from 'vue'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Saves the automation's draft whenever the flow changes, one request at a time. `request()` says
 * "the flow changed"; a request made while a save is in flight is remembered and becomes one more
 * save of whatever the flow is by then (so many quick edits are at most two requests). A failed
 * save stays failed, and `pending` stays true, until a later save succeeds (`retry`).
 *
 * `save` must read the latest flow itself when it is called.
 */
export function useDraftSaver<R = void>(save: () => Promise<R>, now: () => Date = () => new Date()) {
  const status = ref<SaveStatus>('idle')
  const savedAt = ref<Date>()
  const result = ref<R>()
  let queued = false
  let running: Promise<void> | undefined

  async function loop() {
    try {
      while (queued) {
        queued = false
        status.value = 'saving'
        try {
          result.value = await save()
          savedAt.value = now()
          status.value = queued ? 'saving' : 'saved'
        } catch {
          // Whatever was queued meanwhile is covered by the retry, which saves the latest flow.
          status.value = 'error'
          return
        }
      }
    } finally {
      running = undefined
    }
  }

  function request() {
    queued = true
    running ??= loop()
  }

  /** Resolves when nothing is left to save; false if the last save failed. */
  async function flush(): Promise<boolean> {
    while (running) await running
    return status.value !== 'error'
  }

  /** A change not yet saved: a save is under way or queued, or the last one failed. */
  const pending = computed(() => status.value === 'saving' || status.value === 'error')

  return { status, savedAt, result, pending, request, retry: request, flush }
}
