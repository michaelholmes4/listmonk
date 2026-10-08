import { describe, expect, it } from 'vitest'
import fixture from './fixtures/settings.json'
import type { Settings } from '@/api/types'
import {
  emptyMessenger,
  emptySmtp,
  halfEditedSecret,
  isMasked,
  parseEmailHeaders,
  settingsSchema,
  SETTING_KEYS,
  toForm,
  toRequest,
} from './schema'

const t = (k: string, a?: unknown) => `${k}${a ? JSON.stringify(a) : ''}`
// The server omits an unset S3 secret; give the fixture the key so it has the full shape.
const settings = { 'upload.s3.aws_secret_access_key': '', ...fixture } as unknown as Settings
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

describe('settings mapping', () => {
  it('knows every key the server sends, and nothing else', () => {
    expect([...SETTING_KEYS].sort()).toEqual(Object.keys(settings).sort())
  })

  it('round-trips a real response unchanged (masked secrets go out empty)', () => {
    const out = toRequest(toForm(settings)) as unknown as Record<string, unknown>
    const want = clone(settings) as unknown as Record<string, unknown>
    // Masked passwords are sent as '' ("keep"); everything else must come back identical.
    for (const s of want.smtp as { password: string }[]) s.password = ''
    for (const s of want['bounce.mailboxes'] as { password: string }[]) s.password = ''
    for (const s of want.messengers as { password: string }[]) s.password = ''
    expect(out).toEqual(want)
  })

  it('validates a real response', () => {
    const r = settingsSchema(t).safeParse(toForm(settings))
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([])
  })

  it('shows lists as lines and sends them back as trimmed lowercase entries', () => {
    const s = clone(settings)
    s['privacy.domain_blocklist'] = ['Spam.com', 'bad.org']
    const f = toForm(s)
    expect(f.privacy.domain_blocklist).toBe('Spam.com\nbad.org')
    f.privacy.domain_blocklist = ' Spam.com \n\n BAD.org '
    f.security.trusted_urls = 'https://a.test\n\nhttps://b.test '
    const out = toRequest(f)
    expect(out['privacy.domain_blocklist']).toEqual(['spam.com', 'bad.org'])
    expect(out['security.trusted_urls']).toEqual(['https://a.test', 'https://b.test'])
  })

  it('edits SMTP email headers as JSON text', () => {
    const f = toForm(settings)
    f.smtp[0].strEmailHeaders = '[{"X-Custom": "v"}]'
    expect(toRequest(f).smtp?.[0].email_headers).toEqual([{ 'X-Custom': 'v' }])
    f.smtp[0].strEmailHeaders = ''
    expect(toRequest(f).smtp?.[0].email_headers).toEqual([])
    expect(parseEmailHeaders('{"a":1}')).toBeNull()
    expect(parseEmailHeaders('nope')).toBeNull()
  })

  it('does not leak form-only fields to the API', () => {
    const f = toForm(settings)
    f.smtp.push(emptySmtp())
    f.messengers.push(emptyMessenger())
    const out = toRequest(f)
    expect(Object.keys(out.smtp![1])).not.toContain('_key')
    expect(Object.keys(out.smtp![1])).not.toContain('strEmailHeaders')
    expect(Object.keys(out.messengers![0])).not.toContain('_key')
  })
})

describe('blocks without a stored password', () => {
  it('treats the omitted key as empty, validates, and sends it as empty', () => {
    const s = clone(settings)
    for (const b of [...(s.smtp ?? []), ...(s.messengers ?? []), ...(s['bounce.mailboxes'] ?? [])]) delete (b as { password?: string }).password
    const f = toForm(s)
    expect(settingsSchema(t).safeParse(f).success).toBe(true)
    expect(toRequest(f)['bounce.mailboxes']?.[0].password).toBe('')
  })
})

describe('secrets', () => {
  it('treats empty or all-bullet values as unchanged', () => {
    expect(isMasked('')).toBe(true)
    expect(isMasked('••••••')).toBe(true)
    expect(isMasked('hunter2')).toBe(false)
  })

  it('sends a newly typed secret and blanks a masked one', () => {
    const f = toForm(settings)
    f.smtp[0].password = 'new-secret'
    f.bounce.sendgrid_key = '••••'
    const out = toRequest(f)
    expect(out.smtp?.[0].password).toBe('new-secret')
    expect(out['bounce.sendgrid_key']).toBe('')
  })

  it('flags a secret edited around its bullets', () => {
    const f = toForm(settings)
    expect(halfEditedSecret(f)).toBeNull()
    f.smtp[0].password = '••••x'
    expect(halfEditedSecret(f)).toBe('smtp #1')
  })
})

describe('validation', () => {
  const errors = (mutate: (f: ReturnType<typeof toForm>) => void) => {
    const f = toForm(settings)
    mutate(f)
    const r = settingsSchema(t).safeParse(f)
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
  }

  it('needs a site name and a root URL', () => {
    expect(errors((f) => (f.app.site_name = ''))).toContain('app.site_name')
    expect(errors((f) => (f.app.root_url = 'localhost'))).toContain('app.root_url')
  })
  it('checks durations and cron only where they apply', () => {
    expect(errors((f) => (f.smtp[0].idle_timeout = '15 seconds'))).toContain('smtp.0.idle_timeout')
    expect(errors((f) => ((f.app.cache_slow_queries = false), (f.app.cache_slow_queries_interval = 'x')))).toEqual([])
    expect(errors((f) => ((f.app.cache_slow_queries = true), (f.app.cache_slow_queries_interval = 'x')))).toContain('app.cache_slow_queries_interval')
  })
  it('requires OIDC details only when OIDC is on', () => {
    expect(errors((f) => (f.security.oidc.enabled = true))).toEqual(
      expect.arrayContaining(['security.oidc.provider_url', 'security.oidc.client_id', 'security.oidc.client_secret']),
    )
  })
  it('requires the S3 URL only for S3', () => {
    expect(errors((f) => ((f.upload.provider = 's3'), (f.upload.s3.url = '')))).toContain('upload.s3.url')
    expect(errors((f) => ((f.upload.provider = 'filesystem'), (f.upload.s3.url = '')))).toEqual([])
  })
  it('rejects malformed email headers', () => {
    expect(errors((f) => (f.smtp[0].strEmailHeaders = '{"a":1}'))).toContain('smtp.0.strEmailHeaders')
  })
})

describe('reactive input', () => {
  it('maps form values that are Vue reactive proxies (what vee-validate hands over)', async () => {
    const { reactive } = await import('vue')
    const form = reactive(toForm(settings))
    expect(() => toRequest(form)).not.toThrow()
    expect(toRequest(form)['app.site_name']).toBe(settings['app.site_name'])
  })
})
