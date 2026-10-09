import { z } from 'zod'
import type { ListRole, NewListRole, NewRole, Role, ServerConfig } from '@/api/types'

export const SUPER_ADMIN_ROLE_ID = 1

type T = (key: string, ...args: unknown[]) => string
type PermissionGroup = { group: string; permissions: string[] }

/** The groups defined in permissions.json, as the server reports them. */
export const permissionGroups = (cfg?: ServerConfig): PermissionGroup[] => (cfg?.permissions ?? []) as PermissionGroup[]

export const userRoleSchema = (t: T) =>
  z.object({
    name: z.string().trim().min(1, t('globals.messages.invalidFields', { name: 'name' })).max(200),
    permissions: z.array(z.string()),
  })
export type UserRoleForm = z.infer<ReturnType<typeof userRoleSchema>>

export const listRoleSchema = (t: T) =>
  z.object({
    name: z.string().trim().min(1, t('globals.messages.invalidFields', { name: 'name' })).max(200),
    lists: z.array(z.object({ id: z.number(), name: z.string(), permissions: z.array(z.enum(['list:get', 'list:manage'])) })),
  })
export type ListRoleForm = z.infer<ReturnType<typeof listRoleSchema>>

/** A new role starts with the everyday permissions: nothing administrative, no raw SQL. */
export function defaultPermissions(groups: PermissionGroup[]): string[] {
  const skipGroups = ['admin', 'users', 'message_log']
  return groups
    .filter((g) => !skipGroups.includes(g.group))
    .flatMap((g) => g.permissions)
    .filter((p) => p !== 'subscribers:sql_query' && !p.startsWith('lists:') && !p.startsWith('settings:'))
}

export const emptyUserRole = (groups: PermissionGroup[]): UserRoleForm => ({ name: '', permissions: defaultPermissions(groups) })
export const emptyListRole = (): ListRoleForm => ({ name: '', lists: [] })

export const toUserRoleForm = (r: Role): UserRoleForm => ({ name: r.name ?? '', permissions: [...(r.permissions ?? [])] })
export const toListRoleForm = (r: ListRole): ListRoleForm => ({
  name: r.name ?? '',
  lists: (r.lists ?? []).map((l) => ({
    id: l.id!,
    name: l.name ?? '',
    permissions: (l.permissions ?? []).filter((p): p is 'list:get' | 'list:manage' => p === 'list:get' || p === 'list:manage'),
  })),
})

export const toUserRoleRequest = (v: UserRoleForm): NewRole => ({ name: v.name, permissions: v.permissions })
export const toListRoleRequest = (v: ListRoleForm): NewListRole => ({
  name: v.name,
  lists: v.lists.map((l) => ({ id: l.id, permissions: l.permissions })),
})
