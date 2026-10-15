/** A condition, as the server stores it (see AutomationRule in the API spec). */
export interface Rule {
  op?: 'and' | 'or'
  rules?: Rule[]
  type?: RuleType
  path?: string
  operator?: string
  value?: string | number | boolean
  /** property: compare with this property of the run's event instead of `value` (is / is not only). */
  value_from?: string
  list_id?: number
  node_id?: string
  name?: string
  within?: string
  /** event: `entered` counts only occurrences since the run started. */
  since?: 'entered'
  /** event: only occurrences whose properties match (a group of property tests). */
  where?: Rule
  query?: string
}

export const ruleTypes = ['attribute', 'subscriber', 'list', 'step', 'event', 'property', 'sql'] as const
export type RuleType = (typeof ruleTypes)[number]

export const subscriberFields = ['email', 'name', 'status'] as const

export const operators: Record<RuleType, string[]> = {
  attribute: ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists'],
  subscriber: ['eq', 'neq', 'contains'],
  list: ['is_member', 'is_not_member', 'confirmed', 'unsubscribed'],
  step: ['opened', 'not_opened', 'clicked', 'not_clicked'],
  event: ['occurred', 'not_occurred'],
  property: ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists'],
  sql: [],
}

/** Operators that compare with a value (the others, like "exists", take none). */
export const needsValue = (operator?: string) => !!operator && !['exists', 'not_exists'].includes(operator)
export const isOrdering = (operator?: string) => ['gt', 'gte', 'lt', 'lte'].includes(operator ?? '')

export const isGroup = (r: Rule) => !r.type

export const emptyGroup = (): Rule => ({ op: 'and', rules: [emptyLeaf('attribute')] })

/** An event filter: a group that only holds property tests. */
export const emptyFilter = (): Rule => ({ op: 'and', rules: [emptyLeaf('property')] })

/** Operators that can compare with the run's event instead of a typed value. */
export const canCompareWithEvent = (operator?: string) => operator === 'eq' || operator === 'neq'

export function emptyLeaf(type: RuleType): Rule {
  switch (type) {
    case 'attribute':
    case 'property':
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

export interface RuleOpts {
  allowSQL: boolean
  emailSteps: string[]
  /** An event filter: property tests only. */
  filter?: boolean
  /** A trigger's filter, where there is no run's event to compare with yet. */
  noRunEvent?: boolean
}

/** Problems that can be seen without the server; it checks the rest on save. */
export function ruleIssues(r: Rule, opts: RuleOpts, at: number[] = []): RuleIssue[] {
  const bad = (key: string): RuleIssue[] => [{ key, at }]
  if (isGroup(r)) {
    if (!r.rules?.length) return bad('web.automations.rule.emptyGroup')
    return r.rules.flatMap((c, i) => ruleIssues(c, opts, [...at, i]))
  }
  if (opts.filter && r.type !== 'property') return bad('web.automations.rule.propertyOnly')
  switch (r.type) {
    case 'property':
      if (!attrPath.test(r.path ?? '')) return bad('web.automations.rule.propertyRequired')
      if (r.value_from !== undefined) {
        if (opts.noRunEvent) return bad('web.automations.rule.noRunEvent')
        if (!canCompareWithEvent(r.operator)) return bad('web.automations.rule.compareEqOnly')
        if (!attrPath.test(r.value_from)) return bad('web.automations.rule.propertyRequired')
        return []
      }
      if (needsValue(r.operator) && (r.value === undefined || r.value === '')) return bad('web.automations.rule.valueRequired')
      return []
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
      if (r.within !== undefined && !isDuration(r.within)) return bad('web.automations.invalidDuration')
      // The filter's own issues are reported against the event test.
      if (r.where && ruleIssues(r.where, { ...opts, filter: true }).length) return bad('web.automations.rule.filterIncomplete')
      return []
    case 'sql':
      if (!opts.allowSQL) return bad('web.automations.rule.sqlNotAllowed')
      return r.query?.trim() ? [] : bad('web.automations.rule.sqlRequired')
  }
  return bad('web.automations.rule.typeRequired')
}
