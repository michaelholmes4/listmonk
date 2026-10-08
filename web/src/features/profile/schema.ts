import { z } from 'zod'
import type { ProfileUpdate } from '@/api/profile'
import type { User } from '@/api/types'

type T = (key: string, ...args: unknown[]) => string

/**
 * `needsEmail`: people who log in with a password have an email they can change; for everyone else
 * (API users, SSO) the server ignores it.
 */
export const profileSchema = (t: T, needsEmail: boolean) =>
  z
    .object({
      name: z.string().trim().max(200),
      email: z.string().trim().max(200),
      password: z.string().max(200),
      password2: z.string().max(200),
    })
    .superRefine((v, ctx) => {
      if (needsEmail && !/^[^\s@]+@[^\s@]+$/.test(v.email)) {
        ctx.addIssue({ code: 'custom', path: ['email'], message: t('globals.messages.invalidFields', { name: 'email' }) })
      }
      if (!v.password) return
      if (v.password.length < 8) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: t('globals.messages.invalidFields', { name: 'password' }) })
      } else if (v.password !== v.password2) {
        ctx.addIssue({ code: 'custom', path: ['password2'], message: t('users.passwordMismatch') })
      }
    })

export type ProfileForm = z.infer<ReturnType<typeof profileSchema>>

export const toForm = (u: User): ProfileForm => ({ name: u.name ?? '', email: u.email ?? '', password: '', password2: '' })

/** A blank password is left out entirely, so the server keeps the current one. */
export function toRequest(v: ProfileForm): ProfileUpdate {
  return { name: v.name, email: v.email, ...(v.password ? { password: v.password, password2: v.password2 } : {}) }
}
