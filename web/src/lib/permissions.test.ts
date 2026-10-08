import { describe, expect, it } from 'vitest'
import type { User } from '@/api/types'
import { userCan } from './permissions'

const user = (id: number, permissions: string[]): User => ({ user_role: { id, name: 'r', permissions } })

describe('userCan', () => {
  it('allows when no permission is required', () => {
    expect(userCan(undefined)).toBe(true)
  })

  it('denies everything until the profile has loaded', () => {
    expect(userCan(undefined, 'campaigns:get')).toBe(false)
  })

  it('treats role 1 as super admin', () => {
    expect(userCan(user(1, []), 'settings:manage')).toBe(true)
  })

  it('matches an exact permission', () => {
    const u = user(2, ['campaigns:get'])
    expect(userCan(u, 'campaigns:get')).toBe(true)
    expect(userCan(u, 'campaigns:manage')).toBe(false)
  })

  it('is true when ANY of several permissions is held', () => {
    expect(userCan(user(2, ['lists:manage_all']), 'lists:get_all', 'lists:manage_all')).toBe(true)
  })

  it('supports group wildcards', () => {
    expect(userCan(user(2, ['campaigns:get_analytics']), 'campaigns:*')).toBe(true)
    expect(userCan(user(2, ['lists:get_all']), 'campaigns:*')).toBe(false)
  })

  it('does not let a wildcard prefix match a different group', () => {
    expect(userCan(user(2, ['campaigns_other:get']), 'campaigns:*')).toBe(false)
  })
})
