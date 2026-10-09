import type { AutomationGraph } from '@/api/types'

/**
 * The builder edits a tree (a list of steps, where a condition owns a "yes" and a "no" list, a wait for an event one list per path); the
 * server stores nodes and edges. These two views of the same thing are converted here, and nothing
 * else in the UI deals with edges.
 *
 * Shape rules (the server enforces the same): a branching step, an exit and a go to end their list, because a
 * branching step's continuation is its paths and nothing follows an exit or a go to. A go to keeps its target
 * in its config, so it is a leaf here.
 */

export const stepTypes = [
  'send_email',
  'delay',
  'wait_until',
  'wait_for_event',
  'condition',
  'go_to',
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
  /** Only on a branching step: the steps down each path, by handle (a condition has yes and no). */
  branches?: Record<string, Step[]>
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

/** An event a wait for an event watches. A restart event starts the wait again and has no path. */
export interface WaitEvent {
  id: string
  name: string
  restart?: boolean
}

export const waitEvents = (c: Config): WaitEvent[] => (Array.isArray(c.events) ? (c.events as WaitEvent[]) : [])

/** Steps whose continuation is several paths instead of one next step. */
export const isBranching = (type: StepType) => type === 'condition' || type === 'wait_for_event'

/** The paths out of a branching step, in display order. */
export function branchHandles(s: Step): string[] {
  switch (s.type) {
    case 'condition':
      return ['yes', 'no']
    case 'wait_for_event':
      return [...waitEvents(s.config).filter((e) => !e.restart).map((e) => e.id), 'timeout']
    default:
      return []
  }
}

/** After a wait for an event's settings change: gives new paths an empty list and drops the lists of paths that are gone. */
export function syncBranches(s: Step) {
  if (!isBranching(s.type)) return
  const handles = branchHandles(s)
  const old = s.branches ?? {}
  s.branches = Object.fromEntries(handles.map((h) => [h, old[h] ?? []]))
}

/** True when nothing can be added after this step in its list: a branching step continues in its paths, nothing follows an exit or a go to. */
export const endsList = (s: Step | undefined) => !!s && (isBranching(s.type) || s.type === 'exit' || s.type === 'go_to')

export const defaultConfig = (type: StepType): Config => {
  switch (type) {
    case 'send_email':
      return { message_type: 'marketing' }
    case 'delay':
      return { duration: '1d' }
    case 'wait_until':
      return {}
    case 'wait_for_event':
      return { timeout: '1h', events: [{ id: 'e1', name: '', restart: false }] }
    case 'condition':
      return { rule: { op: 'and', rules: [{ type: 'attribute', path: '', operator: 'eq', value: '' }] } }
    case 'go_to':
      return { target: '', max_runs: 25 }
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
      if (isBranching(step.type)) {
        step.branches = {}
        for (const h of branchHandles(step)) step.branches[h] = walk(next.get(`${id}|${h}`))
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
      if (isBranching(s.type)) {
        for (const h of branchHandles(s)) {
          const first = emit(s.branches?.[h] ?? [])
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
    for (const h of branchHandles(s)) yield* allSteps(s.branches?.[h] ?? [])
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
  if (isBranching(type)) s.branches = Object.fromEntries(branchHandles(s).map((h) => [h, [] as Step[]]))
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
      for (const h of branchHandles(s)) {
        const hit = find(s.branches?.[h] ?? [])
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

/** Removes a step (a branching step takes its paths with it). */
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
    if (isBranching(s.type)) {
      // A branching step ends its list: the way on is one of its paths.
      for (const h of branchHandles(s)) {
        const hit = pathTo(s.branches?.[h] ?? [], id, [...here, s])
        if (hit) return hit
      }
      return undefined
    }
    here.push(s)
  }
  return undefined
}

/** Email steps that come before `id` on its path: the ones a condition there may ask about. */
export const emailStepsBefore = (f: Flow, id: string): Step[] =>
  (pathTo(f.steps, id, []) ?? []).filter((s) => s.type === 'send_email')

/** The steps a go to can continue at: every step except go to steps, in flow order. */
export const goToTargets = (f: Flow, id: string): Step[] => [...allSteps(f.steps)].filter((s) => s.id !== id && s.type !== 'go_to')

/** Target step id -> the ids of the go to steps pointing at it. */
export function jumpsInto(f: Flow): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const s of allSteps(f.steps)) {
    const to = s.type === 'go_to' ? s.config.target : undefined
    if (typeof to === 'string' && to) out.set(to, [...(out.get(to) ?? []), s.id])
  }
  return out
}

/** Number of steps, conditions' branches included. */
export const countSteps = (f: Flow) => [...allSteps(f.steps)].length
