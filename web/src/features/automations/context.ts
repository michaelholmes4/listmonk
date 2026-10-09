import { inject, provide, type Ref } from 'vue'
import type { AutomationNodeStat } from '@/api/types'
import type { Config, StepType } from './model'
import type { Step } from './model'
import type { Issue } from './validate'
import type { Lookups } from './summary'

/** What the step cards and lists need from the builder that owns the flow. */
export interface BuilderContext {
  readonly: Ref<boolean>
  /** Per-step counts, when the automation has run. */
  stats: Ref<Map<string, AutomationNodeStat>>
  /** Problems found locally (missing settings), by step or trigger id. */
  issues: Ref<Map<string, Issue[]>>
  /** Problems the server reported, by step id. */
  problems: Ref<Map<string, string[]>>
  lookups: Lookups
  /** Go to steps pointing at each step, by target id. */
  jumps: Ref<Map<string, string[]>>
  /** The step to highlight (what a hovered go to points at). */
  highlight: Ref<string | null>
  /** The step or trigger open in the panel. */
  selected: Ref<string | null>
  /** Writes `patch` into the open step's saved settings (after its own edits), and saves the draft. */
  commit: (id: string, patch: Config) => void
  /** Resolves when the draft is saved; false if that failed. */
  flush: () => Promise<boolean>
  add: (list: Step[], index: number, type: StepType) => void
  open: (id: string) => void
  remove: (id: string) => void
  move: (id: string, dir: -1 | 1) => void
}

const KEY = Symbol('automation-builder')

export const provideBuilder = (c: BuilderContext) => provide(KEY, c)

export function useBuilder(): BuilderContext {
  const c = inject<BuilderContext>(KEY)
  if (!c) throw new Error('useBuilder() outside of a builder')
  return c
}
