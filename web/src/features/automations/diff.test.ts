import { describe, expect, it } from 'vitest'
import { flowChanges } from './diff'
import type { Flow, Step } from './model'

const email = (id: string, campaign: number): Step => ({ id, type: 'send_email', config: { message_type: 'marketing', list_id: 1, campaign_id: campaign } })
const delay = (id: string, d: string): Step => ({ id, type: 'delay', config: { duration: d } })
const live: Flow = {
  triggers: [{ id: 't1', type: 'list_joined', config: { list_id: 1 } }],
  steps: [
    delay('d1', '1d'),
    { id: 'c', type: 'condition', config: { rule: { type: 'step', node_id: 'e1', operator: 'opened' } }, branches: { yes: [email('e1', 7)], no: [] } },
  ],
}
const copy = (): Flow => structuredClone(live)
const kinds = (a: Flow, b: Flow) => flowChanges(a, b).map((c) => `${c.kind} ${(c.step ?? c.trigger).id}`)

describe('what changed', () => {
  it('finds nothing in a copy', () => {
    expect(flowChanges(live, copy())).toEqual([])
  })

  it('finds added, removed and changed steps, in a branch too', () => {
    const f = copy()
    f.steps[0] = delay('d1', '2d')
    f.steps[1].branches!.no.push(email('e2', 8))
    f.steps[1].branches!.yes = []
    expect(kinds(live, f)).toEqual(['changed d1', 'added e2', 'removed e1'])
    expect(flowChanges(live, f)[0].before).toEqual(delay('d1', '1d'))
  })

  it('tells a step pointed at other content apart from one whose settings changed', () => {
    const f = copy()
    f.steps[1].branches!.yes[0].config.campaign_id = 9
    expect(kinds(live, f)).toEqual(['email e1'])
    f.steps[1].branches!.yes[0].config.list_id = 2
    expect(kinds(live, f)).toEqual(['changed e1'])
  })

  it('finds moved steps, but not those that only shifted because of an insert', () => {
    const swapped = copy()
    swapped.steps.reverse()
    expect(kinds(live, swapped)).toEqual(['moved c', 'moved d1'])

    const inserted = copy()
    inserted.steps.unshift(delay('d0', '1h'))
    expect(kinds(live, inserted)).toEqual(['added d0'])

    // Onto another path.
    const across = copy()
    across.steps[1].branches = { yes: [], no: [email('e1', 7)] }
    expect(kinds(live, across)).toEqual(['moved e1'])
  })

  it('finds trigger changes', () => {
    const f = copy()
    f.triggers[0].config.list_id = 2
    f.triggers.push({ id: 't2', type: 'manual', config: {} })
    expect(kinds(live, f)).toEqual(['changed t1', 'added t2'])
    expect(kinds(f, live)).toEqual(['changed t1', 'removed t2'])
  })
})
