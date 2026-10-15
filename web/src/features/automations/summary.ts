import { stepMeta } from './labels'
import { waitEvents, type Config, type Step, type Trigger } from './model'
import { isGroup, needsValue, type Rule } from './rule'

type T = (key: string, params?: Record<string, unknown>) => string

export interface Lookups {
  /** List names by id. */
  list: (id: number) => string | undefined
  /** A step of the flow by id (a go to shows where it goes). */
  step?: (id: string) => Step | undefined
  /** What an email step sends: its subject, or its template's name. */
  email?: (s: Step) => string | undefined
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : 0)

const duration = (t: T, d: string): string => {
  const m = /^(\d+)([smhdw])$/.exec(d)
  if (!m) return d
  const unit = { s: 'seconds', m: 'minutes', h: 'hours', d: 'days', w: 'weeks' }[m[2] as 's' | 'm' | 'h' | 'd' | 'w']
  return t(`web.automations.units.${unit}`, { n: Number(m[1]) })
}

const listName = (l: Lookups, id: unknown) => l.list(num(id)) ?? `#${num(id)}`

/** A short description of what a trigger is set to, for its card. */
export function triggerSummary(t: T, tr: Trigger, l: Lookups): string {
  const c = tr.config
  switch (tr.type) {
    case 'list_joined':
      return c.list_id ? listName(l, c.list_id) : ''
    case 'attribute_changed':
      return c.equals === undefined || c.equals === null
        ? str(c.attribute)
        : `${str(c.attribute)} = ${typeof c.equals === 'string' ? c.equals : JSON.stringify(c.equals)}`
    case 'event': {
      const where = c.where ? ruleSummary(t, c.where as Rule, l, true) : ''
      return where && str(c.event) ? `${str(c.event)} (${where})` : str(c.event)
    }
    case 'manual':
      return ''
  }
}

/** A short description of what a step is set to, for its card. Empty means "not set up yet". */
export function stepSummary(t: T, s: Step, l: Lookups, c: Config = s.config): string {
  switch (s.type) {
    case 'send_email': {
      // A transactional email has no topic.
      const kind =
        c.message_type === 'transactional'
          ? t('web.automations.messageType.transactional')
          : c.list_id
            ? `${t('web.automations.messageType.marketing')} · ${listName(l, c.list_id)}`
            : ''
      const name = kind ? l.email?.({ ...s, config: c }) : undefined
      return name ? `${name} · ${kind}` : kind
    }
    case 'delay':
      return str(c.duration) ? duration(t, str(c.duration)) : ''
    case 'wait_until': {
      const off = str(c.offset)
      if (c.attribute) return off ? `${str(c.attribute)} ${off.startsWith('-') ? '−' : '+'} ${duration(t, off.replace(/^-/, ''))}` : str(c.attribute)
      return c.at ? new Date(str(c.at)).toLocaleString() : ''
    }
    case 'wait_for_event': {
      const names = waitEvents(c)
        .filter((e) => str(e.name))
        .map((e) => {
          const name = e.where ? `${e.name} (${ruleSummary(t, e.where, l, true)})` : e.name
          return e.restart ? `${name} (${t('web.automations.waitForEvent.restarts')})` : name
        })
      if (!names.length) return ''
      return [t('web.automations.waitForEvent.upTo', { time: duration(t, str(c.timeout)) }), names.join(', ')].join(' · ')
    }
    case 'condition':
      return c.rule ? ruleSummary(t, c.rule as Rule, l) : ''
    case 'go_to': {
      const target = str(c.target) ? l.step?.(str(c.target)) : undefined
      if (!target) return ''
      const inner = target.type === 'go_to' ? '' : stepSummary(t, target, l)
      return `→ ${t(stepMeta[target.type].title)}${inner ? `: ${inner}` : ''}`
    }
    case 'update_attribute':
      return !c.attribute ? '' : c.unset ? t('web.automations.removeAttribute', { name: str(c.attribute) }) : `${str(c.attribute)} = ${typeof c.value === 'string' ? c.value : JSON.stringify(c.value)}`
    case 'add_to_list':
    case 'remove_from_list':
      return c.list_id ? listName(l, c.list_id) : ''
    case 'exit':
      return str(c.reason)
  }
}

const value = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

/** A rule in a line ("plan is pro and Welcome was opened"); a nested group goes in brackets. */
export function ruleSummary(t: T, r: Rule, l: Lookups, nested = false): string {
  if (isGroup(r)) {
    const parts = (r.rules ?? []).map((x) => ruleSummary(t, x, l, true)).filter(Boolean)
    const joined = parts.join(` ${t(r.op === 'or' ? 'web.automations.rule.or' : 'web.automations.rule.and')} `)
    return nested && parts.length > 1 ? `(${joined})` : joined
  }
  const op = r.operator ? t(`web.automations.rule.op.${r.type === 'subscriber' || r.type === 'property' ? 'attribute' : r.type}.${r.operator}`) : ''
  switch (r.type) {
    case 'attribute':
      if (!r.path) return ''
      return needsValue(r.operator) ? `${r.path} ${op} ${value(r.value)}` : `${r.path} ${op}`
    case 'subscriber':
      return `${t(`web.automations.rule.fields.${r.path}`)} ${op} ${value(r.value)}`
    case 'list':
      return r.list_id ? `${op}: ${listName(l, r.list_id)}` : ''
    case 'step': {
      const step = r.node_id ? l.step?.(r.node_id) : undefined
      if (!step) return ''
      return `${l.email?.(step) ?? t('web.automations.step.send_email')} ${op}`
    }
    case 'property': {
      if (!r.path) return ''
      const subject = `${t('web.automations.rule.eventPrefix')} ${r.path}`
      if (r.value_from !== undefined) return `${subject} ${op} ${t('web.automations.rule.runEventProperty')} ${r.value_from}`
      return needsValue(r.operator) ? `${subject} ${op} ${value(r.value)}` : `${subject} ${op}`
    }
    case 'event': {
      if (!r.name) return ''
      const where = r.where ? ruleSummary(t, r.where, l, true) : ''
      const name = where ? `${r.name} (${where})` : r.name
      if (r.since) return `${name} ${op} ${t('web.automations.rule.sinceEntered')}`
      return r.within ? `${name} ${op} ${t('web.automations.rule.within')} ${duration(t, r.within)}` : `${name} ${op}`
    }
    case 'sql':
      return t('web.automations.rule.types.sql')
  }
  return ''
}
