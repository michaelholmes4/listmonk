import { computed, shallowReactive, type Component } from 'vue'

export interface Command {
  id: string
  /** Group heading, already translated. */
  group: string
  label: string
  icon?: Component
  /** Extra words the palette matches on. */
  keywords?: string[]
  run: () => void
}

/** A provider returns the commands that are currently available (it may read reactive state). */
export type CommandProvider = () => Command[]

const providers = shallowReactive(new Map<string, CommandProvider>())

/**
 * Registers a source of palette commands. Providers are re-evaluated reactively, so they can
 * depend on permissions, the current route, translations... Returns an unregister function;
 * call it from `onScopeDispose`.
 */
export function registerCommandProvider(id: string, provider: CommandProvider): () => void {
  providers.set(id, provider)
  return () => {
    providers.delete(id)
  }
}

export const commands = computed(() => [...providers.values()].flatMap((p) => p()))
