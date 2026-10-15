import { describe, expect, it } from 'vitest'
import webEn from '@/locales/en.json'
import type { Step } from './model'
import { ruleSummary, stepSummary, triggerSummary, type Lookups } from './summary'

const en = webEn as Record<string, string>
// Enough of vue-i18n for these strings: "{n} day | {n} days" picks by n.
const t = (key: string, p?: Record<string, unknown>) => {
  const forms = (en[key] ?? key).split(' | ')
  return forms[forms.length > 1 && p?.n !== 1 ? 1 : 0].replace('{n}', String(p?.n ?? ''))
}

const welcome: Step = { id: 'welcome', type: 'send_email', config: { message_type: 'marketing', list_id: 1, campaign_id: 7 } }
const l: Lookups = {
  list: (id) => ({ 1: 'Newsletter' })[id],
  step: (id) => (id === 'welcome' ? welcome : undefined),
  email: (s) => (s.config.campaign_id === 7 ? 'Welcome aboard' : undefined),
}

describe('step summaries', () => {
  it('names the email before its type and topic, when it is known', () => {
    expect(stepSummary(t, welcome, l)).toBe('Welcome aboard · Marketing · Newsletter')
    expect(stepSummary(t, welcome, { list: l.list })).toBe('Marketing · Newsletter')
    // Not set up yet: no topic, so nothing, even with a name.
    expect(stepSummary(t, { ...welcome, config: { message_type: 'marketing', campaign_id: 7 } }, l)).toBe('')
  })

  it('says what a condition tests', () => {
    const cond: Step = { id: 'c', type: 'condition', config: { rule: { type: 'step', node_id: 'welcome', operator: 'opened' } } }
    expect(stepSummary(t, cond, l)).toBe('Welcome aboard was opened')
    expect(stepSummary(t, { ...cond, config: {} }, l)).toBe('')
  })
})

describe('rule summaries', () => {
  it('reads each kind of test', () => {
    expect(ruleSummary(t, { type: 'attribute', path: 'plan', operator: 'eq', value: 'pro' }, l)).toBe('plan is pro')
    expect(ruleSummary(t, { type: 'attribute', path: 'plan', operator: 'exists' }, l)).toBe('plan is set')
    expect(ruleSummary(t, { type: 'subscriber', path: 'email', operator: 'contains', value: '@acme.com' }, l)).toBe('Email contains @acme.com')
    expect(ruleSummary(t, { type: 'list', operator: 'is_member', list_id: 1 }, l)).toBe('is on the list: Newsletter')
    expect(ruleSummary(t, { type: 'event', name: 'order_placed', operator: 'occurred', within: '7d' }, l)).toBe('order_placed happened within the last 7 days')
    expect(ruleSummary(t, { type: 'sql', query: 'true' }, l)).toBe('SQL')
  })

  it('joins a group, and brackets a nested one', () => {
    const plan = { type: 'attribute' as const, path: 'plan', operator: 'eq', value: 'pro' }
    const opened = { type: 'step' as const, node_id: 'welcome', operator: 'opened' }
    expect(ruleSummary(t, { op: 'and', rules: [plan, opened] }, l)).toBe('plan is pro and Welcome aboard was opened')
    expect(ruleSummary(t, { op: 'and', rules: [plan, { op: 'or', rules: [opened, plan] }] }, l)).toBe(
      'plan is pro and (Welcome aboard was opened or plan is pro)',
    )
    // An unfinished test is left out rather than shown half-written.
    expect(ruleSummary(t, { op: 'and', rules: [plan, { type: 'attribute', path: '', operator: 'eq' }] }, l)).toBe('plan is pro')
  })
})

describe('event filters', () => {
  it('says which events count', () => {
    const where = { op: 'and' as const, rules: [{ type: 'property' as const, path: 'product', operator: 'eq', value_from: 'product' }] }
    expect(ruleSummary(t, { type: 'event', name: 'order_completed', operator: 'occurred', since: 'entered', where }, l)).toBe(
      "order_completed (event product is the starting event's property product) happened since they entered",
    )
    expect(ruleSummary(t, { type: 'property', path: 'plan', operator: 'eq', value: 'pro' }, l)).toBe('event plan is pro')
    const trig = { id: 't', type: 'event' as const, config: { event: 'trial_started', where: { op: 'and', rules: [{ type: 'property', path: 'plan', operator: 'exists' }] } } }
    expect(triggerSummary(t, trig, l)).toBe('trial_started (event plan is set)')
  })
})
