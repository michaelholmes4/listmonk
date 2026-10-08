import { describe, expect, it } from 'vitest'
import { defaultPermissions, listRoleSchema, toListRoleRequest, userRoleSchema } from './schema'

const t = (k: string) => k
const groups = [
  { group: 'lists', permissions: ['lists:get_all', 'lists:manage_all'] },
  { group: 'subscribers', permissions: ['subscribers:get', 'subscribers:manage', 'subscribers:sql_query', 'tx:send'] },
  { group: 'users', permissions: ['users:get', 'users:manage'] },
  { group: 'settings', permissions: ['settings:get', 'settings:manage'] },
  { group: 'campaigns', permissions: ['campaigns:get', 'campaigns:manage'] },
]

describe('defaultPermissions', () => {
  it('leaves out administrative, list-wide, settings and raw SQL permissions', () => {
    expect(defaultPermissions(groups)).toEqual(['subscribers:get', 'subscribers:manage', 'tx:send', 'campaigns:get', 'campaigns:manage'])
  })
})

describe('role schemas', () => {
  it('needs a name', () => {
    expect(userRoleSchema(t).safeParse({ name: '  ', permissions: [] }).success).toBe(false)
    expect(listRoleSchema(t).safeParse({ name: 'x', lists: [] }).success).toBe(true)
  })
  it('sends only ids and permissions for list roles', () => {
    expect(toListRoleRequest({ name: 'r', lists: [{ id: 3, name: 'News', permissions: ['list:get'] }] })).toEqual({
      name: 'r',
      lists: [{ id: 3, permissions: ['list:get'] }],
    })
  })
})
