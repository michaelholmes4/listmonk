import { branchHandles, emailStepsBefore, waitEvents, type Flow, type Step, type Trigger } from './model'
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
      if (pos(c.campaign_id) === pos(c.template_id)) bad('content', 'web.automations.email.contentRequired')
      break
    case 'wait_for_event': {
      if (!isDuration(String(c.timeout ?? ''))) bad('timeout', 'web.automations.invalidDuration')
      const events = waitEvents(c)
      if (events.length < 1 || events.length > 10) bad('events', 'web.automations.waitForEvent.eventCount')
      const seen = new Set<string>()
      events.forEach((e, i) => {
        const name = (e.name ?? '').trim()
        if (!name) bad(`event.${i}`, 'web.automations.waitForEvent.nameRequired')
        else if (seen.has(name)) bad(`event.${i}`, 'web.automations.waitForEvent.nameUnique')
        seen.add(name)
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
    case 'exit':
      break
  }
  return out
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
      return has(c.event) ? [] : [{ field: 'event', key: 'web.automations.trigger.eventRequired' }]
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
  for (const t of f.triggers) {
    const i = triggerIssues(t)
    if (i.length) out.set(t.id, i)
  }
  return out
}
