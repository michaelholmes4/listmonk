import { nextTick, reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { Flow } from './model'
import { useStepPanel } from './useStepPanel'

const make = () => {
  const flow = reactive<Flow>({
    triggers: [{ id: 't1', type: 'event', config: { event: 'a' } }],
    steps: [
      { id: 's1', type: 'delay', config: { duration: '1d' } },
      { id: 's2', type: 'delay', config: { duration: '2d' } },
    ],
  })
  const onChange = vi.fn()
  return { flow, onChange, p: useStepPanel(flow, onChange) }
}
const s1 = { kind: 'step', id: 's1' } as const
const s2 = { kind: 'step', id: 's2' } as const

describe('useStepPanel', () => {
  it('edits touch only the copy until saved', () => {
    const { flow, onChange, p } = make()
    p.request(s1)
    p.draft.value = { duration: '3h' }
    expect(p.dirty.value).toBe(true)
    expect(flow.steps[0]!.config).toEqual({ duration: '1d' })
    expect(onChange).not.toHaveBeenCalled()
    p.save()
    expect(flow.steps[0]!.config).toEqual({ duration: '3h' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(p.dirty.value).toBe(false)
  })

  it('save does nothing without edits', () => {
    const { onChange, p } = make()
    p.request(s1)
    p.save()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cancel throws the copy away and closes', () => {
    const { flow, p } = make()
    p.request(s1)
    p.draft.value = { duration: '3h' }
    p.cancel()
    expect(p.target.value).toBeNull()
    expect(flow.steps[0]!.config).toEqual({ duration: '1d' })
    p.request(s1)
    expect(p.draft.value).toEqual({ duration: '1d' })
  })

  it('moving on with edits asks first; keep stays, discard drops, save keeps them', () => {
    const { flow, onChange, p } = make()
    p.request(s1)
    p.draft.value = { duration: '3h' }
    p.request(s2)
    expect(p.target.value).toEqual(s1)
    expect(p.leaving.value?.next).toEqual(s2)

    p.resolve('keep')
    expect(p.leaving.value).toBeUndefined()
    expect(p.draft.value).toEqual({ duration: '3h' })

    p.request(s2)
    p.resolve('discard')
    expect(p.target.value).toEqual(s2)
    expect(flow.steps[0]!.config).toEqual({ duration: '1d' })
    expect(p.draft.value).toEqual({ duration: '2d' })

    p.draft.value = { duration: '9d' }
    p.request(null)
    p.resolve('save')
    expect(p.target.value).toBeNull()
    expect(flow.steps[1]!.config).toEqual({ duration: '9d' })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('never asks when there are no edits', () => {
    const { p } = make()
    p.request(s1)
    p.request(s2)
    expect(p.leaving.value).toBeUndefined()
    expect(p.target.value).toEqual(s2)
  })

  it('works on triggers too', () => {
    const { flow, p } = make()
    p.request({ kind: 'trigger', id: 't1' })
    p.draft.value = { event: 'b' }
    p.save()
    expect(flow.triggers[0]!.config).toEqual({ event: 'b' })
  })

  it('closes when the open step is deleted, without asking', async () => {
    const { flow, p } = make()
    p.request(s1)
    p.draft.value = { duration: '3h' }
    await nextTick() // the open step is noticed
    flow.steps.splice(0, 1)
    await nextTick()
    expect(p.target.value).toBeNull()
    expect(p.leaving.value).toBeUndefined()
  })

  it('remembers that the copy was edited, even after it is saved', async () => {
    const { p } = make()
    p.request(s1)
    expect(p.touched.value).toBe(false)
    p.draft.value = { duration: '3h' }
    await nextTick()
    p.save()
    await nextTick()
    expect(p.touched.value).toBe(true)
  })
})
