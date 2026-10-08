import type { User } from '@/api/types'

/** User role 1 is the built-in Super Admin, which implicitly has every permission. */
export const SUPER_ADMIN_ROLE_ID = 1

/**
 * True if the user holds ANY of the given permissions; passing none means "no gate".
 * A permission ending in `*` (e.g. `campaigns:*`) matches when the user holds at least one
 * permission in that group. Mirrors the old UI's `$can()`.
 */
export function userCan(user: User | undefined, ...wanted: string[]): boolean {
  if (!wanted.length) return true
  if (!user) return false
  if (user.user_role?.id === SUPER_ADMIN_ROLE_ID) return true

  const have = user.user_role?.permissions ?? []
  return wanted.some((p) => (p.endsWith('*') ? have.some((h) => h.startsWith(p.slice(0, -1))) : have.includes(p)))
}
