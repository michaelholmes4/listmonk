import { describe, expect, it } from 'vitest'
import { newStep, type Flow, type Step } from './model'
import { flowIssues, stepIssues, triggerIssues } from './validate'

const flow = (steps: Step[]): Flow => ({ triggers: [{ id: 't', type: 'event', config: { event: 'x' } }], steps })
const ctx = (f: Flow) => ({ flow: f, allowSQL: false })

describe('step issues', () => {
  it('needs a topic and content for an email', () => {
    const s = newStep(flow([]), 'send_email')
    expect(stepIssues(s, ctx(flow([s]))).map((i) => i.field)).toEqual(['list_id', 'content'])
    s.config = { message_type: 'marketing', list_id: 3, campaign_id: 9 }
    expect(stepIssues(s, ctx(flow([s])))).toEqual([])
    // Both a campaign and a template is as wrong as neither.
    s.config = { message_type: 'transactional', list_id: 3, campaign_id: 9, template_id: 2 }
    expect(stepIssues(s, ctx(flow([s]))).map((i) => i.field)).toEqual(['content'])
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
})
