/** A condition, as the server stores it (see AutomationRule in the API spec). */
export interface Rule {
  op?: 'and' | 'or'
  rules?: Rule[]
  type?: RuleType
  path?: string
  operator?: string
  value?: string | number | boolean
  list_id?: number
  node_id?: string
  name?: string
  within?: string
  query?: string
}

export const ruleTypes = ['attribute', 'subscriber', 'list', 'step', 'event', 'sql'] as const
export type RuleType = (typeof ruleTypes)[number]

export const subscriberFields = ['email', 'name', 'status'] as const

export const operators: Record<RuleType, string[]> = {
  attribute: ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists'],
  subscriber: ['eq', 'neq', 'contains'],
  list: ['is_member', 'is_not_member', 'confirmed', 'unsubscribed'],
  step: ['opened', 'not_opened', 'clicked', 'not_clicked'],
  event: ['occurred', 'not_occurred'],
  sql: [],
}

/** Operators that compare with a value (the others, like "exists", take none). */
export const needsValue = (operator?: string) => !!operator && !['exists', 'not_exists'].includes(operator)
export const isOrdering = (operator?: string) => ['gt', 'gte', 'lt', 'lte'].includes(operator ?? '')

export const isGroup = (r: Rule) => !r.type

export const emptyGroup = (): Rule => ({ op: 'and', rules: [emptyLeaf('attribute')] })

export function emptyLeaf(type: RuleType): Rule {
  switch (type) {
    case 'attribute':
      return { type, path: '', operator: 'eq', value: '' }
    case 'subscriber':
      return { type, path: 'email', operator: 'contains', value: '' }
    case 'list':
      return { type, operator: 'is_member' }
    case 'step':
      return { type, operator: 'opened' }
    case 'event':
      return { type, operator: 'occurred', name: '' }
    case 'sql':
      return { type, query: '' }
  }
}

/** The value as typed: ordering comparisons use numbers when the text is one, everything else keeps text. */
export function coerceValue(operator: string | undefined, text: string): string | number {
  if (isOrdering(operator) && text.trim() !== '' && !Number.isNaN(Number(text))) return Number(text)
  return text
}

const attrPath = /^[A-Za-z0-9_\- ]+(\.[A-Za-z0-9_\- ]+)*$/
export const isDuration = (s: string) => /^\d+[smhdw]$/.test(s) && !/^0+[smhdw]$/.test(s)

/** Whether the rule uses opened/clicked conditions (which need individual tracking). */
export function usesEngagement(r: Rule | undefined): boolean {
  if (!r) return false
  if (isGroup(r)) return (r.rules ?? []).some(usesEngagement)
  return r.type === 'step'
}

export interface RuleIssue {
  /** i18n key. */
  key: string
  /** Path to the leaf in the tree, for marking the field. */
  at: number[]
}

/** Problems that can be seen without the server; it checks the rest on save. */
export function ruleIssues(r: Rule, opts: { allowSQL: boolean; emailSteps: string[] }, at: number[] = []): RuleIssue[] {
  const bad = (key: string): RuleIssue[] => [{ key, at }]
  if (isGroup(r)) {
    if (!r.rules?.length) return bad('web.automations.rule.emptyGroup')
    return r.rules.flatMap((c, i) => ruleIssues(c, opts, [...at, i]))
  }
  switch (r.type) {
    case 'attribute':
      if (!attrPath.test(r.path ?? '')) return bad('web.automations.rule.attributeRequired')
      if (needsValue(r.operator) && (r.value === undefined || r.value === '')) return bad('web.automations.rule.valueRequired')
      return []
    case 'subscriber':
      if (r.value === undefined || r.value === '') return bad('web.automations.rule.valueRequired')
      return []
    case 'list':
      return r.list_id ? [] : bad('web.automations.rule.listRequired')
    case 'step':
      return r.node_id && opts.emailSteps.includes(r.node_id) ? [] : bad('web.automations.rule.stepRequired')
    case 'event':
      if (!r.name?.trim()) return bad('web.automations.rule.eventRequired')
      if (r.within && !isDuration(r.within)) return bad('web.automations.invalidDuration')
      return []
    case 'sql':
      if (!opts.allowSQL) return bad('web.automations.rule.sqlNotAllowed')
      return r.query?.trim() ? [] : bad('web.automations.rule.sqlRequired')
  }
  return bad('web.automations.rule.typeRequired')
}
