import { describe, expect, it } from 'vitest'
import { coerceValue, emptyGroup, emptyLeaf, isDuration, ruleIssues, usesEngagement, type Rule } from './rule'

const ok = { allowSQL: false, emailSteps: ['welcome'] }

describe('rule issues', () => {
  it('accepts a complete attribute rule and flags missing parts', () => {
    expect(ruleIssues({ type: 'attribute', path: 'plan', operator: 'eq', value: 'pro' }, ok)).toEqual([])
    expect(ruleIssues({ type: 'attribute', path: 'address.city', operator: 'exists' }, ok)).toEqual([])
    expect(ruleIssues(emptyLeaf('attribute'), ok).map((i) => i.key)).toEqual(['web.automations.rule.attributeRequired'])
    expect(ruleIssues({ type: 'attribute', path: 'plan', operator: 'eq', value: '' }, ok).map((i) => i.key)).toEqual(['web.automations.rule.valueRequired'])
    expect(ruleIssues({ type: 'attribute', path: 'bad;name', operator: 'eq', value: 'x' }, ok)).toHaveLength(1)
  })

  it('only lets a step rule ask about an earlier email step', () => {
    expect(ruleIssues({ type: 'step', node_id: 'welcome', operator: 'opened' }, ok)).toEqual([])
    expect(ruleIssues({ type: 'step', node_id: 'other', operator: 'opened' }, ok)).toHaveLength(1)
    expect(ruleIssues({ type: 'step', operator: 'opened' }, ok)).toHaveLength(1)
  })

  it('holds raw SQL back unless it is allowed', () => {
    const q: Rule = { type: 'sql', query: 'true' }
    expect(ruleIssues(q, ok).map((i) => i.key)).toEqual(['web.automations.rule.sqlNotAllowed'])
    expect(ruleIssues(q, { ...ok, allowSQL: true })).toEqual([])
    expect(ruleIssues({ type: 'sql', query: ' ' }, { ...ok, allowSQL: true })).toHaveLength(1)
  })

  it('reports problems with their position in nested groups', () => {
    const r: Rule = { op: 'or', rules: [{ type: 'list', list_id: 1, operator: 'is_member' }, { op: 'and', rules: [emptyLeaf('event')] }] }
    expect(ruleIssues(r, ok)).toEqual([{ key: 'web.automations.rule.eventRequired', at: [1, 0] }])
    expect(ruleIssues({ op: 'and', rules: [] }, ok)[0]?.key).toBe('web.automations.rule.emptyGroup')
  })

  it('checks the event window', () => {
    expect(ruleIssues({ type: 'event', name: 'x', operator: 'occurred', within: '7d' }, ok)).toEqual([])
    expect(ruleIssues({ type: 'event', name: 'x', operator: 'occurred', within: 'soon' }, ok)).toHaveLength(1)
  })
})

describe('helpers', () => {
  it('coerces numbers only for ordering comparisons', () => {
    expect(coerceValue('gt', '10')).toBe(10)
    expect(coerceValue('gte', '2.5')).toBe(2.5)
    expect(coerceValue('gt', '2026-01-01')).toBe('2026-01-01')
    expect(coerceValue('eq', '10')).toBe('10')
    expect(coerceValue('gt', '')).toBe('')
  })

  it('validates durations like the server', () => {
    for (const d of ['30m', '2h', '3d', '1w', '45s']) expect(isDuration(d)).toBe(true)
    for (const d of ['', '0d', 'd', '1y', '1.5h', '-1d', '10']) expect(isDuration(d)).toBe(false)
  })

  it('knows when a rule needs individual tracking', () => {
    expect(usesEngagement({ type: 'step', node_id: 'a', operator: 'opened' })).toBe(true)
    expect(usesEngagement({ op: 'and', rules: [emptyLeaf('attribute'), { op: 'or', rules: [emptyLeaf('step')] }] })).toBe(true)
    expect(usesEngagement(emptyGroup())).toBe(false)
    expect(usesEngagement(undefined)).toBe(false)
  })
})
