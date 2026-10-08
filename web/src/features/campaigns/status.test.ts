import { describe, expect, it } from 'vitest'
import type { Campaign } from '@/api/types'
import { canCancel, canEdit, canPause, canResume, canSchedule, canStart, isDone, isScheduled } from './status'

type Status = NonNullable<Campaign['status']>
const c = (status: Status, send_at: string | null = null) => ({ status, send_at })

describe('campaign status rules', () => {
  it('a draft without a send time starts; with one it is scheduled', () => {
    expect(canStart(c('draft'))).toBe(true)
    expect(canSchedule(c('draft'))).toBe(false)
    expect(canStart(c('draft', '2026-12-01T10:00:00Z'))).toBe(false)
    expect(canSchedule(c('draft', '2026-12-01T10:00:00Z'))).toBe(true)
  })
  it('only running campaigns pause; only paused ones resume', () => {
    expect(canPause(c('running'))).toBe(true)
    expect(canPause(c('paused'))).toBe(false)
    expect(canResume(c('paused'))).toBe(true)
    expect(canResume(c('running'))).toBe(false)
  })
  it('running and paused campaigns can be cancelled, finished ones cannot', () => {
    expect(canCancel(c('running'))).toBe(true)
    expect(canCancel(c('paused'))).toBe(true)
    expect(canCancel(c('finished'))).toBe(false)
  })
  it('finished and cancelled are done', () => {
    expect(isDone(c('finished'))).toBe(true)
    expect(isDone(c('cancelled'))).toBe(true)
    expect(isDone(c('draft'))).toBe(false)
  })
  it('a campaign with a send time counts as scheduled even while draft', () => {
    expect(isScheduled(c('draft', '2026-12-01T10:00:00Z'))).toBe(true)
    expect(isScheduled(c('draft'))).toBe(false)
  })
  it('content is editable until it is running or over', () => {
    for (const s of ['draft', 'scheduled', 'paused'] as Status[]) expect(canEdit(c(s))).toBe(true)
    for (const s of ['running', 'finished', 'cancelled'] as Status[]) expect(canEdit(c(s))).toBe(false)
  })
})
