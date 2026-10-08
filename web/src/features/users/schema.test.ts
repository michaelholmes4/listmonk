import { describe, expect, it } from 'vitest'
import { emptyUser, toRequest, userSchema, type UserForm } from './schema'

const t = (k: string) => k
const valid = (over: Partial<UserForm> = {}): UserForm => ({ ...emptyUser(), username: 'jane', email: 'jane@example.com', userRoleId: 2, ...over })
const errors = (v: UserForm, editing = false) => {
  const r = userSchema(t, editing).safeParse(v)
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('userSchema', () => {
  it('accepts a person without password login', () => {
    expect(errors(valid())).toEqual([])
  })
  it('rejects bad usernames and emails', () => {
    expect(errors(valid({ username: 'a b' }))).toContain('username')
    expect(errors(valid({ username: 'ab' }))).toContain('username')
    expect(errors(valid({ email: 'nope' }))).toContain('email')
  })
  it('does not ask an API user for an email', () => {
    expect(errors(valid({ type: 'api', email: '' }))).toEqual([])
  })
  it('requires a password when enabling password login on a new user', () => {
    expect(errors(valid({ passwordLogin: true }))).toContain('password')
    expect(errors(valid({ passwordLogin: true, password: 'longenough', password2: 'different1' }))).toContain('password2')
    expect(errors(valid({ passwordLogin: true, password: 'longenough', password2: 'longenough' }))).toEqual([])
  })
  it('lets an existing user keep their password by leaving it blank', () => {
    expect(errors(valid({ passwordLogin: true }), true)).toEqual([])
    expect(errors(valid({ passwordLogin: true, password: 'short' }), true)).toContain('password')
  })
  it('requires a user role', () => {
    expect(errors(valid({ userRoleId: undefined as unknown as number }))).toContain('userRoleId')
  })
})

describe('toRequest', () => {
  it('drops password fields when password login is off, and email for API users', () => {
    const body = toRequest(valid({ password: 'leftover1', password2: 'leftover1' }))
    expect(body).toMatchObject({ password_login: false, password: null, password2: null })
    expect(toRequest(valid({ type: 'api' })).email).toBeUndefined()
  })
  it('sends a blank password as null so the server keeps the current one', () => {
    expect(toRequest(valid({ passwordLogin: true })).password).toBeNull()
    expect(toRequest(valid({ passwordLogin: true, password: 'longenough', password2: 'longenough' })).password).toBe('longenough')
  })
})
