import type { AutomationStatus, EnrollmentStatus } from '@/api/types'

export const automationStatuses: AutomationStatus[] = ['draft', 'active', 'paused', 'archived']
export const enrollmentStatuses: EnrollmentStatus[] = ['active', 'waiting', 'completed', 'exited', 'failed']

export const automationVariant = (s?: string) =>
  s === 'active' ? 'success' : s === 'paused' ? 'warning' : s === 'archived' ? 'secondary' : 'outline'

export const enrollmentVariant = (s?: string) =>
  s === 'active' || s === 'waiting' ? 'success' : s === 'failed' ? 'destructive' : s === 'exited' ? 'warning' : 'secondary'

/** What can be done to an automation in each state. */
export const canPause = (s?: string) => s === 'active'
export const canResume = (s?: string) => s === 'paused'
export const canArchive = (s?: string) => s === 'active' || s === 'paused'
/** A live automation must be archived first. */
export const canDelete = (s?: string) => s === 'draft' || s === 'archived'
export const isLive = (s?: string) => s === 'active' || s === 'paused'
