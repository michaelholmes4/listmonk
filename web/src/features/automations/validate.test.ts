import { describe, expect, it } from 'vitest'
import { flowToGraph, newStep, type Flow, type Step } from './model'
import { flowIssues, instantLoops, stepIssues, triggerIssues } from './validate'

const flow = (steps: Step[]): Flow => ({ triggers: [{ id: 't', type: 'event', config: { event: 'x' } }], steps })
const ctx = (f: Flow) => ({ flow: f, allowSQL: false })

describe('step issues', () => {
  it('needs a topic and content for an email', () => {
    const s = newStep(flow([]), 'send_email')
    expect(stepIssues(s, ctx(flow([s]))).map((i) => i.field)).toEqual(['list_id', 'content'])
    // Marketing can't use a template, so the message doesn't offer one.
    expect(stepIssues(s, ctx(flow([s])))[1].key).toBe('web.automations.email.writeRequired')
    s.config = { message_type: 'marketing', list_id: 3, campaign_id: 9 }
    expect(stepIssues(s, ctx(flow([s])))).toEqual([])
    // Both a campaign and a template is as wrong as neither.
    s.config = { message_type: 'transactional', list_id: 3, campaign_id: 9, template_id: 2 }
    expect(stepIssues(s, ctx(flow([s]))).map((i) => i.field)).toEqual(['content'])
    // A transactional template has no unsubscribe link.
    s.config = { message_type: 'marketing', list_id: 3, template_id: 2 }
    expect(stepIssues(s, ctx(flow([s])))).toEqual([{ field: 'content', key: 'web.automations.email.marketingTemplate' }])
  })

  it('needs no topic for a transactional email', () => {
    const s: Step = { id: 'm', type: 'send_email', config: { message_type: 'transactional', campaign_id: 9 } }
    expect(stepIssues(s, ctx(flow([s])))).toEqual([])
    s.config = { message_type: 'marketing', campaign_id: 9 }
    expect(stepIssues(s, ctx(flow([s]))).map((i) => i.field)).toEqual(['list_id'])
  })

  it('checks delays and wait-untils', () => {
    expect(stepIssues({ id: 'a', type: 'delay', config: { duration: '2d' } }, ctx(flow([])))).toEqual([])
    expect(stepIssues({ id: 'a', type: 'delay', config: { duration: 'soon' } }, ctx(flow([]))).map((i) => i.field)).toEqual(['duration'])
    expect(stepIssues({ id: 'a', type: 'wait_until', config: {} }, ctx(flow([]))).map((i) => i.field)).toEqual(['attribute'])
    expect(stepIssues({ id: 'a', type: 'wait_until', config: { attribute: 'renews', offset: '-3d' } }, ctx(flow([])))).toEqual([])
    expect(stepIssues({ id: 'a', type: 'wait_until', config: { attribute: 'renews', offset: '-3x' } }, ctx(flow([]))).map((i) => i.field)).toEqual(['offset'])
    expect(stepIssues({ id: 'a', type: 'wait_until', config: { at: '2030-01-01T00:00:00Z', attribute: 'x' } }, ctx(flow([]))).length).toBe(1)
  })

  it('checks attribute and list steps', () => {
    expect(stepIssues({ id: 'a', type: 'update_attribute', config: { attribute: '', value: 1 } }, ctx(flow([]))).map((i) => i.field)).toEqual(['attribute'])
    expect(stepIssues({ id: 'a', type: 'update_attribute', config: { attribute: 'plan', unset: true } }, ctx(flow([])))).toEqual([])
    expect(stepIssues({ id: 'a', type: 'update_attribute', config: { attribute: 'plan', value: '' } }, ctx(flow([]))).map((i) => i.field)).toEqual(['value'])
    expect(stepIssues({ id: 'a', type: 'add_to_list', config: {} }, ctx(flow([]))).map((i) => i.field)).toEqual(['list_id'])
    expect(stepIssues({ id: 'a', type: 'remove_from_list', config: { list_id: 2 } }, ctx(flow([])))).toEqual([])
  })

  it('lets a condition ask about earlier emails only', () => {
    const mail: Step = { id: 'm', type: 'send_email', config: { message_type: 'marketing', list_id: 1, campaign_id: 2 } }
    const cond: Step = {
      id: 'c',
      type: 'condition',
      config: { rule: { type: 'step', node_id: 'm', operator: 'opened' } },
      branches: { yes: [], no: [] },
    }
    const f = flow([mail, cond])
    expect(stepIssues(cond, ctx(f))).toEqual([])
    const before = flow([cond, mail])
    expect(stepIssues(before.steps[0]!, ctx(before)).length).toBe(1)
  })
})

describe('trigger issues', () => {
  it('needs the trigger specific setting', () => {
    expect(triggerIssues({ id: 't', type: 'list_joined', config: {} }).map((i) => i.field)).toEqual(['list_id'])
    expect(triggerIssues({ id: 't', type: 'list_joined', config: { list_id: 4 } })).toEqual([])
    expect(triggerIssues({ id: 't', type: 'event', config: { event: ' ' } }).map((i) => i.field)).toEqual(['event'])
    expect(triggerIssues({ id: 't', type: 'attribute_changed', config: { attribute: 'plan' } })).toEqual([])
    expect(triggerIssues({ id: 't', type: 'manual', config: {} })).toEqual([])
  })

  it('checks an event trigger filter, which has no run event to compare with', () => {
    const where = (rule: object) => ({ id: 't', type: 'event' as const, config: { event: 'trial_started', where: { op: 'and', rules: [rule] } } })
    expect(triggerIssues(where({ type: 'property', path: 'product', operator: 'eq', value: 'a' }))).toEqual([])
    expect(triggerIssues(where({ type: 'property', path: 'product', operator: 'eq', value_from: 'product' })).map((i) => i.field)).toEqual(['where'])
  })

  it('collects issues for the whole flow by id', () => {
    const f = flow([{ id: 'd', type: 'delay', config: {} }])
    f.triggers.push({ id: 't2', type: 'event', config: {} })
    expect([...flowIssues(f, false).keys()].sort()).toEqual(['d', 't2'])
  })
})

describe('wait for an event', () => {
  const wait = (config: Step['config']): Step => ({ id: 'w', type: 'wait_for_event', config })
  const fields = (s: Step) => stepIssues(s, ctx(flow([s]))).map((i) => i.field)

  it('is fine with a time limit and named events', () => {
    expect(fields(newStep(flow([]), 'wait_for_event'))).toEqual(['event.0']) // the default has an empty name
    expect(fields(wait({ timeout: '1h', events: [{ id: 'e1', name: 'order_completed' }, { id: 'e2', name: 'checkout_started', restart: true }] }))).toEqual([])
  })

  it('needs a valid time limit', () => {
    expect(fields(wait({ timeout: 'soon', events: [{ id: 'e1', name: 'x' }] }))).toEqual(['timeout'])
    expect(fields(wait({ events: [{ id: 'e1', name: 'x' }] }))).toEqual(['timeout'])
  })

  it('needs 1 to 10 events with unique, non-empty names', () => {
    expect(fields(wait({ timeout: '1h', events: [] }))).toEqual(['events'])
    const eleven = Array.from({ length: 11 }, (_, i) => ({ id: `e${i}`, name: `n${i}` }))
    expect(fields(wait({ timeout: '1h', events: eleven }))).toEqual(['events'])
    expect(fields(wait({ timeout: '1h', events: [{ id: 'e1', name: ' ' }] }))).toEqual(['event.0'])
    expect(fields(wait({ timeout: '1h', events: [{ id: 'e1', name: 'a' }, { id: 'e2', name: ' a' }] }))).toEqual(['event.1'])
  })

  it('lists an event more than once only when the earlier ones are filtered', () => {
    const only = (value: string) => ({ op: 'and' as const, rules: [{ type: 'property' as const, path: 'product', operator: 'eq', value }] })
    expect(fields(wait({ timeout: '1h', events: [{ id: 'e1', name: 'a', where: only('x') }, { id: 'e2', name: 'a' }] }))).toEqual([])
    expect(fields(wait({ timeout: '1h', events: [{ id: 'e1', name: 'a' }, { id: 'e2', name: 'a', where: only('x') }] }))).toEqual(['event.1'])
    expect(fields(wait({ timeout: '1h', events: [{ id: 'e1', name: 'a', where: { op: 'and', rules: [] } }] }))).toEqual(['event.0'])
  })
})

describe('go to', () => {
  const goTo = (config: Record<string, unknown>): Step => ({ id: 'g', type: 'go_to', config })
  const fields = (s: Step, f: Flow) => stepIssues(s, ctx(f)).map((i) => i.field)
  const mailStep = (id: string): Step => ({ id, type: 'send_email', config: { message_type: 'transactional', campaign_id: 1 } })

  it('needs an existing target and a sensible limit', () => {
    const m = mailStep('m')
    expect(fields(goTo({}), flow([m]))).toEqual(['target'])
    expect(fields(goTo({ target: 'gone' }), flow([m]))).toEqual(['target'])
    expect(fields(goTo({ target: 'm' }), flow([m, goTo({ target: 'm' })]))).toEqual([])
    expect(fields(goTo({ target: 'm', max_runs: 100 }), flow([m]))).toEqual([])
    expect(fields(goTo({ target: 'm', max_runs: 0 }), flow([m]))).toEqual(['max_runs'])
    expect(fields(goTo({ target: 'm', max_runs: 101 }), flow([m]))).toEqual(['max_runs'])
    expect(fields(goTo({ target: 'm', max_runs: 1.5 }), flow([m]))).toEqual(['max_runs'])
  })

  // check { yes: [wait, mail, back -> wait] }
  const looping = (wait: Step): Flow =>
    flow([
      {
        id: 'check',
        type: 'condition',
        config: { rule: { type: 'event', name: 'x', operator: 'occurred' } },
        branches: { yes: [wait, mailStep('m'), { ...goTo({ target: wait.id }), id: 'back' }], no: [] },
      },
    ])

  it('rejects a loop with no pause in it', () => {
    expect(instantLoops(flowToGraph(looping({ id: 'w', type: 'wait_until', config: { attribute: 'when' } })))).toEqual(['back'])
    expect(flowIssues(looping({ id: 'w', type: 'wait_until', config: { attribute: 'when' } }), false).get('back')?.map((i) => i.key)).toContain('web.automations.goTo.instantLoop')
  })

  it('accepts a loop through a delay or a wait for an event', () => {
    expect(instantLoops(flowToGraph(looping({ id: 'w', type: 'delay', config: { duration: '1d' } })))).toEqual([])
    expect(instantLoops(flowToGraph(looping({ id: 'w', type: 'wait_for_event', config: { timeout: '1d', events: [] }, branches: { timeout: [] } })))).toEqual([])
  })

  it('accepts a join into another path', () => {
    const f = flow([
      {
        id: 'check',
        type: 'condition',
        config: { rule: { type: 'event', name: 'x', operator: 'occurred' } },
        branches: { yes: [mailStep('a'), mailStep('tail')], no: [{ ...goTo({ target: 'tail' }), id: 'join' }] },
      },
    ])
    expect(instantLoops(flowToGraph(f))).toEqual([])
    expect(flowIssues(f, false).has('join')).toBe(false)
  })
})
