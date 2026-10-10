import { describe, expect, it } from 'vitest'
import { sourceLink } from './source'

describe('sourceLink', () => {
  it('shows nothing when unset or unusable', () => {
    expect(sourceLink(undefined)).toBeNull()
    expect(sourceLink('')).toBeNull()
    expect(sourceLink('not a url')).toBeNull()
  })
  it('never lets a script URL through', () => {
    expect(sourceLink('javascript:alert(1)')).toBeNull()
    expect(sourceLink('data:text/html,hi')).toBeNull()
  })
  it('accepts http(s) repositories', () => {
    expect(sourceLink('https://github.com/acme/listmonk')).toBe('https://github.com/acme/listmonk')
  })
})
