import type { Campaign } from '@/api/types'

/** What can be done to a campaign, by status. Mirrors the rules the classic UI applies. */
type S = Pick<Campaign, 'status' | 'send_at'>

export const canStart = (c: S) => c.status === 'draft' && !c.send_at
export const canSchedule = (c: S) => c.status === 'draft' && !!c.send_at
export const canPause = (c: S) => c.status === 'running'
export const canResume = (c: S) => c.status === 'paused'
export const canCancel = (c: S) => c.status === 'running' || c.status === 'paused'
export const isDone = (c: S) => c.status === 'finished' || c.status === 'cancelled'
export const isScheduled = (c: S) => c.status === 'scheduled' || !!c.send_at
/** A running campaign can't be edited; neither can a finished or cancelled one's content. */
export const canEdit = (c: S) => c.status === 'draft' || c.status === 'scheduled' || c.status === 'paused'
