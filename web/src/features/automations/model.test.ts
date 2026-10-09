import type { AutomationGraph } from '@/api/types'
import { describe, expect, it } from 'vitest'
import {
  allSteps,
  emailStepsBefore,
  emptyFlow,
  flowToGraph,
  graphToFlow,
  insertStep,
  locate,
  moveStep,
  newId,
  newStep,
  removeStep,
  type Flow,
  type Step,
} from './model'

const mail = (id: string): Step => ({ id, type: 'send_email', config: { message_type: 'marketing', list_id: 1, campaign_id: 7 } })
const delay = (id: string): Step => ({ id, type: 'delay', config: { duration: '1d' } })

// welcome -> wait -> condition { yes: [followup, exit], no: [reminder -> wait2] }
function sample(): Flow {
  return {
    triggers: [{ id: 't1', type: 'list_joined', config: { list_id: 3 } }],
    steps: [
      mail('welcome'),
      delay('wait'),
      {
        id: 'check',
        type: 'condition',
        config: { rule: { type: 'step', node_id: 'welcome', operator: 'opened' } },
        branches: {
          yes: [mail('followup'), { id: 'done', type: 'exit', config: {} }],
          no: [mail('reminder'), delay('wait2')],
        },
      },
    ],
  }
}

describe('flow <-> graph', () => {
  it('round-trips a flow with a branching condition', () => {
    const f = sample()
    const g = flowToGraph(f)
    expect(g.root).toBe('welcome')
    expect(g.nodes!.map((n) => n.id).sort()).toEqual(['check', 'done', 'followup', 'reminder', 'wait', 'wait2', 'welcome'])
    expect(g.edges).toContainEqual({ from: 'check', to: 'followup', handle: 'yes' })
    expect(g.edges).toContainEqual({ from: 'check', to: 'reminder', handle: 'no' })
    expect(g.edges).toContainEqual({ from: 'welcome', to: 'wait' })
    expect(graphToFlow(g)).toEqual(f)
  })

  it('handles an empty flow and an empty graph', () => {
    expect(flowToGraph(emptyFlow())).toEqual({ triggers: [], nodes: [], edges: [], root: '' })
    expect(graphToFlow(undefined)).toEqual(emptyFlow())
    expect(graphToFlow({ triggers: [], nodes: [], edges: [], root: '' })).toEqual(emptyFlow())
  })

  it('keeps a condition with only one branch filled', () => {
    const f: Flow = { triggers: [], steps: [{ id: 'c', type: 'condition', config: {}, branches: { yes: [delay('d')], no: [] } }] }
    const g = flowToGraph(f)
    expect(g.edges).toEqual([{ from: 'c', to: 'd', handle: 'yes' }])
    expect(graphToFlow(g)).toEqual(f)
  })

  it('ignores steps that cannot be reached, and survives a cycle', () => {
    const g: AutomationGraph = {
      triggers: [],
      root: 'a',
      nodes: [
        { id: 'a', type: 'delay', config: {} },
        { id: 'b', type: 'delay', config: {} },
        { id: 'orphan', type: 'delay', config: {} },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    }
    expect(graphToFlow(g).steps.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('editing', () => {
  it('numbers new steps past every id in use, triggers included', () => {
    const f = sample()
    f.triggers.push({ id: 's1', type: 'manual', config: {} })
    expect(newId(f)).toBe('s2')
    f.steps.push(delay('s2'))
    expect(newId(f)).toBe('s3')
  })

  it('refuses to put anything after a condition or an exit, or an ending step in the middle', () => {
    const f = sample()
    const yes = f.steps[2]!.branches!.yes!
    expect(insertStep(f.steps, 3, delay('x'))).toBe(false) // after the condition
    expect(insertStep(yes, 2, delay('x'))).toBe(false) // after the exit
    expect(insertStep(yes, 1, newStep(f, 'exit'))).toBe(false) // an exit before another step's position
    expect(insertStep(yes, 1, delay('x'))).toBe(true)
    expect(yes.map((s) => s.id)).toEqual(['followup', 'x', 'done'])
    expect(insertStep(f.steps, 3, newStep(f, 'exit'))).toBe(false)
  })

  it('removes a condition with its branches', () => {
    const f = sample()
    expect(removeStep(f, 'check')).toBe(true)
    expect([...allSteps(f.steps)].map((s) => s.id)).toEqual(['welcome', 'wait'])
    expect(removeStep(f, 'nope')).toBe(false)
  })

  it('moves steps within their list but never past an ending step', () => {
    const f = sample()
    expect(moveStep(f, 'wait', -1)).toBe(true)
    expect(f.steps.map((s) => s.id)).toEqual(['wait', 'welcome', 'check'])
    expect(moveStep(f, 'welcome', 1)).toBe(false) // the condition must stay last
    expect(moveStep(f, 'wait', -1)).toBe(false) // already first
    expect(locate(f, 'wait2')!.list.map((s) => s.id)).toEqual(['reminder', 'wait2'])
  })

  it('knows which email steps a condition can ask about', () => {
    const f = sample()
    expect(emailStepsBefore(f, 'check').map((s) => s.id)).toEqual(['welcome'])
    expect(emailStepsBefore(f, 'wait2').map((s) => s.id)).toEqual(['welcome', 'reminder'])
    expect(emailStepsBefore(f, 'done').map((s) => s.id)).toEqual(['welcome', 'followup'])
    expect(emailStepsBefore(f, 'welcome')).toEqual([])
    expect(emailStepsBefore(f, 'missing')).toEqual([])
  })

  it('builds new steps with usable defaults', () => {
    const f = emptyFlow()
    expect(newStep(f, 'condition')).toMatchObject({ type: 'condition', branches: { yes: [], no: [] } })
    expect(newStep(f, 'delay').config).toEqual({ duration: '1d' })
    expect(newStep(f, 'send_email').config).toEqual({ message_type: 'marketing' })
  })
})
