import { isBranching, type Config, type Flow, type Step, type Trigger } from './model'

/**
 * How the draft differs from the live version, step by step, for "what's changed". Steps and triggers
 * are matched by id, which the builder never reuses.
 * - added / removed: only in one of them.
 * - changed: its settings differ (`before` holds the old step).
 * - email: only the email it sends differs. A step's email is edited in place, so this means the step
 *   was pointed at other content (a new copy of it, say), not that the text was edited.
 * - moved: on another path, or in another order among the steps around it.
 */
export type ChangeKind = 'added' | 'removed' | 'changed' | 'email' | 'moved'

export type Change =
  | { kind: ChangeKind; trigger: Trigger; before?: Trigger; step?: undefined }
  | { kind: ChangeKind; step: Step; before?: Step; trigger?: undefined }

interface Place {
  step: Step
  /** The list it is in: the parent step and path ('' at the top). */
  list: string
}

function places(steps: Step[], list = '', out = new Map<string, Place>()): Map<string, Place> {
  for (const s of steps) {
    out.set(s.id, { step: s, list })
    if (isBranching(s.type)) for (const [h, sub] of Object.entries(s.branches ?? {})) places(sub, `${s.id}/${h}`, out)
  }
  return out
}

const json = (v: unknown) => JSON.stringify(v ?? null)
const withoutEmail = (c: Config) => {
  const { campaign_id: _, ...rest } = c
  return rest
}

export function flowChanges(before: Flow, after: Flow): Change[] {
  const out: Change[] = []

  const was = new Map(before.triggers.map((x) => [x.id, x]))
  const is = new Set(after.triggers.map((x) => x.id))
  for (const tr of after.triggers) {
    const old = was.get(tr.id)
    if (!old) out.push({ kind: 'added', trigger: tr })
    else if (old.type !== tr.type || json(old.config) !== json(tr.config)) out.push({ kind: 'changed', trigger: tr, before: old })
  }
  for (const tr of before.triggers) if (!is.has(tr.id)) out.push({ kind: 'removed', trigger: tr })

  const a = places(before.steps)
  const b = places(after.steps)
  // The order of the steps both have, list by list: a step whose place in it changed has moved.
  const order = (m: Map<string, Place>, other: Map<string, Place>) => {
    const lists = new Map<string, string[]>()
    for (const [id, p] of m) if (other.has(id)) lists.set(p.list, [...(lists.get(p.list) ?? []), id])
    const at = new Map<string, number>()
    for (const ids of lists.values()) ids.forEach((id, i) => at.set(id, i))
    return at
  }
  const oldAt = order(a, b)
  const newAt = order(b, a)

  for (const [id, p] of b) {
    const old = a.get(id)
    if (!old) {
      out.push({ kind: 'added', step: p.step })
      continue
    }
    const s = p.step
    const o = old.step
    if (s.type !== o.type || json(withoutEmail(s.config)) !== json(withoutEmail(o.config))) out.push({ kind: 'changed', step: s, before: o })
    else if (s.type === 'send_email' && s.config.campaign_id !== o.config.campaign_id) out.push({ kind: 'email', step: s, before: o })
    else if (old.list !== p.list || oldAt.get(id) !== newAt.get(id)) out.push({ kind: 'moved', step: s, before: o })
  }
  for (const [id, p] of a) if (!b.has(id)) out.push({ kind: 'removed', step: p.step })
  return out
}
