import { describe, expect, it } from 'vitest'
import { profileSchema, toRequest } from './schema'

const t = (k: string) => k
const errors = (v: object, needsEmail = true) => {
  const r = profileSchema(t, needsEmail).safeParse({ name: 'N', email: 'a@b.co', password: '', password2: '', ...v })
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('profileSchema', () => {
  it('accepts name and email alone', () => {
    expect(errors({})).toEqual([])
  })
  it('only asks for an email when it can be changed', () => {
    expect(errors({ email: '' })).toContain('email')
    expect(errors({ email: '' }, false)).toEqual([])
  })
  it('validates a new password and its repeat', () => {
    expect(errors({ password: 'short' })).toContain('password')
    expect(errors({ password: 'longenough', password2: 'different1' })).toContain('password2')
    expect(errors({ password: 'longenough', password2: 'longenough' })).toEqual([])
  })
})

describe('toRequest', () => {
  it('leaves the password out when blank', () => {
    expect(toRequest({ name: 'N', email: 'a@b.co', password: '', password2: '' })).toEqual({ name: 'N', email: 'a@b.co' })
    expect(toRequest({ name: 'N', email: 'a@b.co', password: 'longenough', password2: 'longenough' })).toMatchObject({ password: 'longenough' })
  })
})
