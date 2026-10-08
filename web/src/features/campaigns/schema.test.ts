import { describe, expect, it } from 'vitest'
import type { Campaign } from '@/api/types'
import {
  campaignSchema,
  emptyCampaign,
  fromLocalInput,
  parseHeaders,
  parseObject,
  toForm,
  toLocalInput,
  toRequest,
} from './schema'

const t = (k: string) => k
const valid = () => ({ ...emptyCampaign('Me <me@x.com>', [1]), name: 'N', subject: 'S' })

describe('JSON fields', () => {
  it('accepts empty text as the empty value', () => {
    expect(parseHeaders('')).toEqual([])
    expect(parseObject('  ')).toEqual({})
  })
  it('rejects the wrong shape or invalid JSON', () => {
    expect(parseHeaders('{"a":1}')).toBeUndefined()
    expect(parseObject('[1]')).toBeUndefined()
    expect(parseObject('{nope')).toBeUndefined()
  })
})

describe('send time', () => {
  it('round-trips a local datetime through ISO', () => {
    const local = '2026-12-01T09:30'
    expect(toLocalInput(fromLocalInput(local))).toBe(local)
  })
  it('is empty when unset', () => {
    expect(toLocalInput(null)).toBe('')
    expect(fromLocalInput('')).toBeNull()
  })
})

describe('campaignSchema', () => {
  const run = (v: object) => campaignSchema(t).safeParse(v)
  it('accepts a minimal valid campaign', () => {
    expect(run(valid()).success).toBe(true)
  })
  it('needs a name, subject, from address and at least one list', () => {
    const r = run({ ...valid(), name: '', subject: '', fromEmail: '', lists: [] })
    expect(r.success).toBe(false)
    const paths = r.success ? [] : r.error.issues.map((i) => i.path[0])
    expect(paths).toEqual(expect.arrayContaining(['name', 'subject', 'fromEmail', 'lists']))
  })
  it('needs a send time only when sending later', () => {
    expect(run({ ...valid(), sendLater: true, sendAt: '' }).success).toBe(false)
    expect(run({ ...valid(), sendLater: true, sendAt: '2026-12-01T09:30' }).success).toBe(true)
  })
  it('validates headers and attribs JSON, and archive meta only when archiving', () => {
    expect(run({ ...valid(), headers: '{}' }).success).toBe(false)
    expect(run({ ...valid(), attribs: '[]' }).success).toBe(false)
    expect(run({ ...valid(), archive: false, archiveMeta: 'nope' }).success).toBe(true)
    expect(run({ ...valid(), archive: true, archiveMeta: 'nope' }).success).toBe(false)
  })
})

describe('toRequest', () => {
  it('sends the time only when sending later', () => {
    const now = { ...valid(), sendLater: false, sendAt: '2026-12-01T09:30' }
    expect(toRequest(now).send_at).toBeNull()
    expect(toRequest({ ...now, sendLater: true }).send_at).toBe(fromLocalInput('2026-12-01T09:30'))
  })
  it('leaves the content out on create', () => {
    expect(toRequest({ ...valid(), body: '<p>x</p>' }, { create: true })).not.toHaveProperty('body')
  })
  it('drops the alternative body for plain-text campaigns', () => {
    const plain = { ...valid(), contentType: 'plain' as const, altbody: 'alt' }
    expect(toRequest(plain).altbody).toBeUndefined()
    expect(toRequest({ ...plain, contentType: 'html' }).altbody).toBe('alt')
  })
  it('does not attach media files that no longer exist', () => {
    const v = { ...valid(), media: [{ id: 3, filename: 'a.png' }, { id: 0, filename: '❌ gone.png' }] }
    expect(toRequest(v).media).toEqual([3])
  })
})

describe('toForm', () => {
  it('maps an API campaign into form values', () => {
    const c: Campaign = {
      id: 1,
      name: 'Autumn',
      subject: 'Hi',
      from_email: 'a@b.c',
      lists: [{ id: 4, name: 'L' }],
      send_at: '2026-12-01T09:30:00Z',
      content_type: 'markdown',
      headers: [{ 'X-A': '1' }],
      attribs: null as unknown as Campaign['attribs'],
      media: [{ id: undefined, filename: 'gone.png' }],
    }
    const f = toForm(c)
    expect(f.lists).toEqual([4])
    expect(f.sendLater).toBe(true)
    expect(f.contentType).toBe('markdown')
    expect(JSON.parse(f.headers)).toEqual([{ 'X-A': '1' }])
    expect(f.attribs).toBe('{}')
    expect(f.media[0].filename).toBe('❌ gone.png')
  })
})
