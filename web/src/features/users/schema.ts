import { z } from 'zod'
import type { NewUser, User } from '@/api/types'

type T = (key: string, ...args: unknown[]) => string

// Same rule as the server (cmd/users.go).
export const usernamePattern = /^[a-zA-Z0-9_\-.@]+$/

/** `editing`: a blank password then means "keep the current one". */
export const userSchema = (t: T, editing: boolean) =>
  z
    .object({
      type: z.enum(['user', 'api']),
      status: z.enum(['enabled', 'disabled']),
      username: z
        .string()
        .trim()
        .min(3, t('globals.messages.invalidFields', { name: 'username' }))
        .max(200)
        .regex(usernamePattern, t('globals.messages.invalidFields', { name: 'username' })),
      name: z.string().trim().max(200),
      email: z.string().trim().max(200),
      passwordLogin: z.boolean(),
      password: z.string().max(200),
      password2: z.string().max(200),
      userRoleId: z.number({ required_error: t('globals.messages.invalidFields', { name: 'role' }) }).int().positive(),
      listRoleId: z.number().int().positive().nullable(),
    })
    .superRefine((v, ctx) => {
      if (v.type === 'api') return
      if (!/^[^\s@]+@[^\s@]+$/.test(v.email)) {
        ctx.addIssue({ code: 'custom', path: ['email'], message: t('globals.messages.invalidFields', { name: 'email' }) })
      }
      if (!v.passwordLogin) return
      const needed = !editing || v.password !== ''
      if (needed && v.password.length < 8) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: t('globals.messages.invalidFields', { name: 'password' }) })
      } else if (v.password !== v.password2) {
        ctx.addIssue({ code: 'custom', path: ['password2'], message: t('users.passwordMismatch') })
      }
    })

export type UserForm = z.infer<ReturnType<typeof userSchema>>

export const emptyUser = (): UserForm => ({
  type: 'user',
  status: 'enabled',
  username: '',
  name: '',
  email: '',
  passwordLogin: false,
  password: '',
  password2: '',
  userRoleId: undefined as unknown as number,
  listRoleId: null,
})

export const toForm = (u: User): UserForm => ({
  type: u.type === 'api' ? 'api' : 'user',
  status: u.status === 'disabled' ? 'disabled' : 'enabled',
  username: u.username ?? '',
  name: u.name ?? '',
  email: u.email ?? '',
  passwordLogin: !!u.password_login,
  password: '',
  password2: '',
  userRoleId: u.user_role?.id ?? u.user_role_id ?? (undefined as unknown as number),
  listRoleId: u.list_role?.id ?? u.list_role_id ?? null,
})

export function toRequest(v: UserForm): NewUser {
  const isUser = v.type === 'user'
  const login = isUser && v.passwordLogin
  return {
    type: v.type,
    status: v.status,
    username: v.username,
    name: v.name,
    email: isUser ? v.email : undefined,
    password_login: login,
    // Blank means "leave the password alone" on update.
    password: login && v.password ? v.password : null,
    password2: login && v.password ? v.password2 : null,
    user_role_id: v.userRoleId,
    list_role_id: v.listRoleId,
  }
}
