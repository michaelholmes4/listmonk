import type { AutomationGraph } from '@/api/types'

/**
 * The builder edits a tree (a list of steps, where a condition owns a "yes" and a "no" list); the
 * server stores nodes and edges. These two views of the same thing are converted here, and nothing
 * else in the UI deals with edges.
 *
 * Shape rules (the server enforces the same): a condition and an exit end their list, because a
 * condition's continuation is its two branches and nothing follows an exit.
 */

export const stepTypes = [
  'send_email',
  'delay',
  'wait_until',
  'condition',
  'update_attribute',
  'add_to_list',
  'remove_from_list',
  'exit',
] as const
export type StepType = (typeof stepTypes)[number]

export const triggerTypes = ['list_joined', 'attribute_changed', 'event', 'manual'] as const
export type TriggerType = (typeof triggerTypes)[number]

export type Config = Record<string, unknown>

export interface Step {
  id: string
  type: StepType
  config: Config
  /** Only on a condition. */
  yes?: Step[]
  no?: Step[]
}

export interface Trigger {
  id: string
  type: TriggerType
  config: Config
}

export interface Flow {
  triggers: Trigger[]
  steps: Step[]
}

export type Branch = 'yes' | 'no'

export const emptyFlow = (): Flow => ({ triggers: [], steps: [] })

/** True when nothing can be added after this step in its list. */
export const endsList = (s: Step | undefined) => !!s && (s.type === 'condition' || s.type === 'exit')

export const defaultConfig = (type: StepType): Config => {
  switch (type) {
    case 'send_email':
      return { message_type: 'marketing' }
    case 'delay':
      return { duration: '1d' }
    case 'wait_until':
      return {}
    case 'condition':
      return { rule: { op: 'and', rules: [{ type: 'attribute', path: '', operator: 'eq', value: '' }] } }
    case 'update_attribute':
      return { attribute: '', value: '' }
    case 'add_to_list':
    case 'remove_from_list':
      return {}
    case 'exit':
      return {}
  }
}

// --- Graph -> flow ---------------------------------------------------------------------------------------

/** Reads the server's graph. Anything unreachable from the root is dropped (the server rejects those on publish). */
export function graphToFlow(g: AutomationGraph | undefined): Flow {
  const nodes = new Map((g?.nodes ?? []).map((n) => [n.id!, n]))
  const next = new Map<string, string>() // `${from}|${handle}` -> to
  for (const e of g?.edges ?? []) next.set(`${e.from}|${e.handle ?? ''}`, e.to!)

  const seen = new Set<string>()
  const walk = (id: string | undefined): Step[] => {
    const out: Step[] = []
    while (id && nodes.has(id) && !seen.has(id)) {
      seen.add(id)
      const n = nodes.get(id)!
      const step: Step = { id, type: n.type as StepType, config: { ...((n.config as Config | undefined) ?? {}) } }
      out.push(step)
      if (step.type === 'condition') {
        step.yes = walk(next.get(`${id}|yes`))
        step.no = walk(next.get(`${id}|no`))
        break
      }
      id = next.get(`${id}|`)
    }
    return out
  }

  return {
    triggers: (g?.triggers ?? []).map((t) => ({ id: t.id!, type: t.type as TriggerType, config: { ...((t.config as Config | undefined) ?? {}) } })),
    steps: walk(g?.root || undefined),
  }
}

// --- Flow -> graph ---------------------------------------------------------------------------------------

export function flowToGraph(f: Flow): AutomationGraph {
  const nodes: NonNullable<AutomationGraph['nodes']> = []
  const edges: NonNullable<AutomationGraph['edges']> = []

  const emit = (list: Step[]): string | undefined => {
    let prev: Step | undefined
    for (const s of list) {
      nodes.push({ id: s.id, type: s.type, config: s.config })
      if (prev) edges.push({ from: prev.id, to: s.id })
      if (s.type === 'condition') {
        for (const h of ['yes', 'no'] as const) {
          const first = emit(s[h] ?? [])
          if (first) edges.push({ from: s.id, to: first, handle: h })
        }
        break // nothing follows a condition in its own list
      }
      prev = s
    }
    return list[0]?.id
  }

  const root = emit(f.steps)
  return {
    triggers: f.triggers.map((t) => ({ id: t.id, type: t.type, config: t.config })),
    nodes,
    edges,
    root: root ?? '',
  }
}

// --- Editing -----------------------------------------------------------------------------------------------

export function* allSteps(list: Step[]): Generator<Step> {
  for (const s of list) {
    yield s
    if (s.type === 'condition') {
      yield* allSteps(s.yes ?? [])
      yield* allSteps(s.no ?? [])
    }
  }
}

/** A step id not used by any step or trigger (`s1`, `s2`, ...). */
export function newId(f: Flow, prefix = 's'): string {
  const used = new Set<string>([...f.triggers.map((t) => t.id), ...[...allSteps(f.steps)].map((s) => s.id)])
  let n = 1
  while (used.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

export function newStep(f: Flow, type: StepType): Step {
  const s: Step = { id: newId(f), type, config: defaultConfig(type) }
  if (type === 'condition') {
    s.yes = []
    s.no = []
  }
  return s
}

/** Where a step lives: the list holding it and its position. */
export interface Location {
  list: Step[]
  index: number
}

export function locate(f: Flow, id: string): Location | undefined {
  const find = (list: Step[]): Location | undefined => {
    for (let i = 0; i < list.length; i++) {
      if (list[i]!.id === id) return { list, index: i }
      const s = list[i]!
      if (s.type === 'condition') {
        const hit = find(s.yes ?? []) ?? find(s.no ?? [])
        if (hit) return hit
      }
    }
    return undefined
  }
  return find(f.steps)
}

/** Inserts at `index` of `list`, which must not follow a step that ends its list. */
export function insertStep(list: Step[], index: number, step: Step): boolean {
  if (index > 0 && endsList(list[index - 1])) return false
  // A step that ends its list can only go last.
  if (endsList(step) && index < list.length) return false
  list.splice(index, 0, step)
  return true
}

/** Removes a step (a condition takes both its branches with it). */
export function removeStep(f: Flow, id: string): boolean {
  const loc = locate(f, id)
  if (!loc) return false
  loc.list.splice(loc.index, 1)
  return true
}

/** Swaps a step with its neighbour. Steps that end a list never move past the end. */
export function moveStep(f: Flow, id: string, dir: -1 | 1): boolean {
  const loc = locate(f, id)
  if (!loc) return false
  const to = loc.index + dir
  if (to < 0 || to >= loc.list.length) return false
  const a = loc.list[loc.index]!
  const b = loc.list[to]!
  if (endsList(a) || endsList(b)) return false
  loc.list[loc.index] = b
  loc.list[to] = a
  return true
}

/** Steps passed on the way from the start to `id` (not including it), or undefined if there is no such step. */
function pathTo(list: Step[], id: string, passed: Step[]): Step[] | undefined {
  const here = [...passed]
  for (const s of list) {
    if (s.id === id) return here
    if (s.type === 'condition') {
      // A condition ends its list: the way on is one of its branches.
      return pathTo(s.yes ?? [], id, [...here, s]) ?? pathTo(s.no ?? [], id, [...here, s])
    }
    here.push(s)
  }
  return undefined
}

/** Email steps that come before `id` on its path: the ones a condition there may ask about. */
export const emailStepsBefore = (f: Flow, id: string): Step[] =>
  (pathTo(f.steps, id, []) ?? []).filter((s) => s.type === 'send_email')

/** Number of steps, conditions' branches included. */
export const countSteps = (f: Flow) => [...allSteps(f.steps)].length
