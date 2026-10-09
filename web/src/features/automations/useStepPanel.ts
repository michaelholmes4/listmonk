import { computed, ref, watch } from 'vue'
import { locate, syncBranches, type Config, type Flow, type Step, type Trigger } from './model'

export interface PanelTarget {
  kind: 'step' | 'trigger'
  id: string
}

const clone = (c: Config): Config => JSON.parse(JSON.stringify(c))
const same = (a: Config, b: Config) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The state of the step panel: which step or trigger is open and a buffered copy of its settings.
 * Edits touch only the copy; `save` writes it into the flow (and calls `onChange` so the page saves
 * the draft), `cancel` throws it away. Moving to another target while the copy has edits does not
 * happen at once: it is held in `leaving` until the user decides (`resolve`).
 */
export function useStepPanel(flow: Flow, onChange: () => void) {
  const target = ref<PanelTarget | null>(null)
  const draft = ref<Config>({})
  /** Set once the copy has been edited, so problems keep showing after it is saved. */
  const touched = ref(false)
  /** Where the user was going when the edits stopped them; `undefined` when nothing is asked. */
  const leaving = ref<{ next: PanelTarget | null; after?: () => void }>()

  const step = computed<Step | undefined>(() => {
    if (target.value?.kind !== 'step') return undefined
    const loc = locate(flow, target.value.id)
    return loc?.list[loc.index]
  })
  const trigger = computed<Trigger | undefined>(() => (target.value?.kind === 'trigger' ? flow.triggers.find((x) => x.id === target.value!.id) : undefined))
  const subject = computed(() => step.value ?? trigger.value)
  const dirty = computed(() => !!subject.value && !same(draft.value, subject.value.config))

  function go(next: PanelTarget | null) {
    leaving.value = undefined
    target.value = next
    touched.value = false
    draft.value = clone(subject.value?.config ?? {})
  }

  watch(dirty, (d) => d && (touched.value = true))
  // The open step was deleted (or went with its branch).
  watch(subject, (s) => !s && target.value && go(null))

  /** Opens `next` (or closes, with null), after asking if there are unsaved edits; `after` runs once it has. */
  function request(next: PanelTarget | null, after?: () => void) {
    if (next?.id === target.value?.id && next?.kind === target.value?.kind) return after?.()
    if (dirty.value) leaving.value = { next, after }
    else {
      go(next)
      after?.()
    }
  }

  function save() {
    const s = subject.value
    if (!s || !dirty.value) return
    s.config = clone(draft.value)
    if (step.value) syncBranches(step.value)
    onChange()
  }

  function edit(c: Config) {
    draft.value = c
  }

  function cancel() {
    go(null)
  }

  function resolve(choice: 'save' | 'discard' | 'keep') {
    const l = leaving.value
    if (!l) return
    if (choice === 'keep') leaving.value = undefined
    else {
      if (choice === 'save') save()
      go(l.next)
      l.after?.()
    }
  }

  return { target, draft, edit, subject, step, trigger, dirty, touched, leaving, request, go, save, cancel, resolve }
}
