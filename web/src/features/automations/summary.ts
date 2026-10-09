import { stepMeta } from './labels'
import { waitEvents, type Config, type Step, type Trigger } from './model'

type T = (key: string, params?: Record<string, unknown>) => string

export interface Lookups {
  /** List names by id. */
  list: (id: number) => string | undefined
  /** A step of the flow by id (a go to shows where it goes). */
  step?: (id: string) => Step | undefined
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
    case 'event':
      return str(c.event)
    case 'manual':
      return ''
  }
}

/** A short description of what a step is set to, for its card. Empty means "not set up yet". */
export function stepSummary(t: T, s: Step, l: Lookups, c: Config = s.config): string {
  switch (s.type) {
    case 'send_email':
      // A transactional email has no topic.
      if (c.message_type === 'transactional') return t('web.automations.messageType.transactional')
      return c.list_id ? `${t('web.automations.messageType.marketing')} · ${listName(l, c.list_id)}` : ''
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
        .map((e) => (e.restart ? `${e.name} (${t('web.automations.waitForEvent.restarts')})` : e.name))
      if (!names.length) return ''
      return [t('web.automations.waitForEvent.upTo', { time: duration(t, str(c.timeout)) }), names.join(', ')].join(' · ')
    }
    case 'condition':
      return ''
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
