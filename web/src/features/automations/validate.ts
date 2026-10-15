import type { AutomationGraph } from '@/api/types'
import { allSteps, branchHandles, emailStepsBefore, flowToGraph, waitEvents, type Flow, type Step, type Trigger } from './model'
import { isDuration, ruleIssues, type Rule } from './rule'

/** A message about a step's settings; `key` is an i18n key, `field` names the input it is about. */
export interface Issue {
  field: string
  key: string
}

export interface Context {
  flow: Flow
  allowSQL: boolean
}

const has = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const pos = (v: unknown) => typeof v === 'number' && v > 0

/** What is missing from a step's settings. The server has the final say; this saves a round trip. */
export function stepIssues(s: Step, ctx: Context): Issue[] {
  const c = s.config
  const out: Issue[] = []
  const bad = (field: string, key: string) => out.push({ field, key })

  switch (s.type) {
    case 'send_email':
      if (c.message_type !== 'marketing' && c.message_type !== 'transactional') bad('message_type', 'web.automations.required')
      if (c.message_type === 'marketing' && !pos(c.list_id)) bad('list_id', 'web.automations.email.topicRequired')
      if (c.message_type === 'marketing' && pos(c.template_id)) bad('content', 'web.automations.email.marketingTemplate')
      else if (pos(c.campaign_id) === pos(c.template_id)) {
        // Marketing emails can't use a template, so don't offer one.
        bad('content', c.message_type === 'marketing' ? 'web.automations.email.writeRequired' : 'web.automations.email.contentRequired')
      }
      break
    case 'wait_for_event': {
      if (!isDuration(String(c.timeout ?? ''))) bad('timeout', 'web.automations.invalidDuration')
      const events = waitEvents(c)
      if (events.length < 1 || events.length > 10) bad('events', 'web.automations.waitForEvent.eventCount')
      // A name may repeat with different filters; the first that matches wins, so one listed after an unfiltered one is never reached.
      const open = new Set<string>()
      events.forEach((e, i) => {
        const name = (e.name ?? '').trim()
        if (!name) bad(`event.${i}`, 'web.automations.waitForEvent.nameRequired')
        else if (open.has(name)) bad(`event.${i}`, 'web.automations.waitForEvent.unreachable')
        else if (e.where && ruleIssues(e.where, { allowSQL: false, emailSteps: [], filter: true }).length) bad(`event.${i}`, 'web.automations.rule.filterIncomplete')
        if (!e.where) open.add(name)
      })
      break
    }
    case 'delay':
      if (!isDuration(String(c.duration ?? ''))) bad('duration', 'web.automations.invalidDuration')
      break
    case 'wait_until':
      if (has(c.at) === has(c.attribute)) bad('attribute', 'web.automations.waitUntil.either')
      if (has(c.offset) && !isDuration(String(c.offset).replace(/^-/, ''))) bad('offset', 'web.automations.invalidDuration')
      break
    case 'condition':
      for (const i of ruleIssues((c.rule ?? {}) as Rule, { allowSQL: ctx.allowSQL, emailSteps: emailStepsBefore(ctx.flow, s.id).map((x) => x.id) })) {
        bad(`rule.${i.at.join('.')}`, i.key)
      }
      break
    case 'update_attribute':
      if (!/^[A-Za-z0-9_\- ]+(\.[A-Za-z0-9_\- ]+)*$/.test(String(c.attribute ?? ''))) bad('attribute', 'web.automations.attributeRequired')
      if (!c.unset && (c.value === undefined || c.value === null || c.value === '')) bad('value', 'web.automations.rule.valueRequired')
      break
    case 'add_to_list':
    case 'remove_from_list':
      if (!pos(c.list_id)) bad('list_id', 'web.automations.rule.listRequired')
      break
    case 'go_to': {
      const target = typeof c.target === 'string' ? c.target : ''
      if (!target) bad('target', 'web.automations.goTo.targetRequired')
      else if (![...allSteps(ctx.flow.steps)].some((x) => x.id === target)) bad('target', 'web.automations.goTo.targetGone')
      const runs = c.max_runs
      if (runs !== undefined && (!Number.isInteger(runs) || (runs as number) < 1 || (runs as number) > 100)) bad('max_runs', 'web.automations.goTo.maxRunsRange')
      break
    }
    case 'exit':
      break
  }
  return out
}

/**
 * The go to steps that sit in a loop with no pause in it, which would repeat instantly. The tree's edges plus
 * each go to's jump form a directed graph; arcs out of delay and wait for an event steps (which always pause)
 * are dropped, and a cycle left over has no pause. A wait until doesn't count: a date already passed finishes it at once.
 */
export function instantLoops(g: AutomationGraph): string[] {
  const types = new Map((g.nodes ?? []).map((n) => [n.id!, n.type]))
  const next = new Map<string, string[]>()
  const arc = (from: string, to: string) => next.set(from, [...(next.get(from) ?? []), to])
  for (const e of g.edges ?? []) arc(e.from!, e.to!)
  for (const n of g.nodes ?? []) {
    const to = (n.config as { target?: string } | undefined)?.target
    if (n.type === 'go_to' && to && types.has(to)) arc(n.id!, to)
  }
  for (const [id, type] of types) if (type === 'delay' || type === 'wait_for_event') next.delete(id)

  const state = new Map<string, 'open' | 'done'>()
  const stack: string[] = []
  const bad = new Set<string>()
  const walk = (id: string) => {
    state.set(id, 'open')
    stack.push(id)
    for (const to of next.get(id) ?? []) {
      if (!state.has(to)) walk(to)
      else if (state.get(to) === 'open') {
        for (const m of stack.slice(stack.lastIndexOf(to))) if (types.get(m) === 'go_to') bad.add(m)
      }
    }
    stack.pop()
    state.set(id, 'done')
  }
  for (const id of types.keys()) if (!state.has(id)) walk(id)
  return [...bad]
}

export function triggerIssues(t: Trigger): Issue[] {
  const c = t.config
  switch (t.type) {
    case 'list_joined':
      return pos(c.list_id) ? [] : [{ field: 'list_id', key: 'web.automations.rule.listRequired' }]
    case 'attribute_changed':
      return /^[A-Za-z0-9_\- ]+(\.[A-Za-z0-9_\- ]+)*$/.test(String(c.attribute ?? ''))
        ? []
        : [{ field: 'attribute', key: 'web.automations.attributeRequired' }]
    case 'event':
      if (!has(c.event)) return [{ field: 'event', key: 'web.automations.trigger.eventRequired' }]
      if (c.where && ruleIssues(c.where as Rule, { allowSQL: false, emailSteps: [], filter: true, noRunEvent: true }).length)
        return [{ field: 'where', key: 'web.automations.rule.filterIncomplete' }]
      return []
    case 'manual':
      return []
  }
}

/** Steps and triggers with something missing, by id (used to flag them in the builder). */
export function flowIssues(f: Flow, allowSQL: boolean): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>()
  const walk = (list: Step[]) => {
    for (const s of list) {
      const i = stepIssues(s, { flow: f, allowSQL })
      if (i.length) out.set(s.id, i)
      for (const h of branchHandles(s)) walk(s.branches?.[h] ?? [])
    }
  }
  walk(f.steps)
  for (const id of instantLoops(flowToGraph(f))) out.set(id, [...(out.get(id) ?? []), { field: 'target', key: 'web.automations.goTo.instantLoop' }])
  for (const t of f.triggers) {
    const i = triggerIssues(t)
    if (i.length) out.set(t.id, i)
  }
  return out
}
