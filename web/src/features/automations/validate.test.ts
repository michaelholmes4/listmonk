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
      yes: [],
      no: [],
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
