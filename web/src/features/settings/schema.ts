import { z } from 'zod'
import type { Settings } from '@/api/types'

type T = (key: string, ...args: unknown[]) => string

export const durationPattern = /^[0-9]+(ms|s|m|h|d)$/
// Five cron fields, as the classic UI checks them.
export const cronPattern = /^((\*|[0-9,\-/]+)\s+){4}(\*|[0-9,\-/]+)$/
const urlPattern = /^https?:\/\/.+/
const emailLike = /^[^\s@]+@[^\s@]+$/
// Accepts an address (user@example.com) or a bare domain (example.com).
export const fromAddressPattern = /^[^\s@]+(\.[^\s@]+)+$|^[^\s@]+@[^\s@]+(\.[^\s@]+)+$/

export const MASK = '•'
/** Secrets come back from the server as a row of bullets (or empty); that means "unchanged". */
export const isMasked = (v: string | undefined | null) => !v || [...v].every((c) => c === MASK)
const hasMask = (v: string | undefined | null) => !!v && v.includes(MASK)

export const smtpAuth = ['login', 'cram', 'plain', 'none'] as const
export const smtpTLS = ['none', 'STARTTLS', 'TLS'] as const
export const bounceActions = ['none', 'unsubscribe', 'blocklist', 'delete'] as const
export const bounceTypes = ['soft', 'hard', 'complaint'] as const

// --- Form model -----------------------------------------------------------------------------------
// The API is a flat object with dotted keys ("app.site_name"); vee-validate paths treat dots as
// nesting, so the form holds the same data nested (app.site_name) and converts at the edges.

export const settingsSchema = (t: T) => {
  const bad = (name: string) => t('globals.messages.invalidFields', { name })
  const duration = (name: string) => z.string().trim().regex(durationPattern, bad(name))
  const int = (min: number, max: number, name: string) => z.number({ invalid_type_error: bad(name) }).int().min(min, bad(name)).max(max, bad(name))

  const smtp = z.object({
    _key: z.string(),
    uuid: z.string(),
    name: z.string().trim().max(100),
    enabled: z.boolean(),
    host: z.string().trim().max(200),
    hello_hostname: z.string().max(200),
    port: int(1, 65535, 'port'),
    auth_protocol: z.enum(smtpAuth),
    username: z.string().max(200),
    password: z.string().max(200),
    strEmailHeaders: z.string().refine((s) => parseEmailHeaders(s) !== null, bad('email_headers')),
    max_conns: int(1, 65535, 'max_conns'),
    max_msg_retries: int(1, 1000, 'max_msg_retries'),
    msg_retry_delay: duration('msg_retry_delay'),
    idle_timeout: duration('idle_timeout'),
    wait_timeout: duration('wait_timeout'),
    tls_type: z.enum(smtpTLS),
    tls_skip_verify: z.boolean(),
    from_addresses: z.array(z.string()),
  })

  const messenger = z.object({
    _key: z.string(),
    uuid: z.string(),
    enabled: z.boolean(),
    name: z.string().trim().max(200),
    root_url: z.string().trim().max(200).refine((v) => !v || urlPattern.test(v), bad('root_url')),
    username: z.string().max(200),
    password: z.string().max(200),
    max_conns: int(1, 65535, 'max_conns'),
    max_msg_retries: int(1, 1000, 'max_msg_retries'),
    timeout: duration('timeout'),
  })

  const mailbox = z.object({
    _key: z.string(),
    uuid: z.string(),
    enabled: z.boolean(),
    type: z.string(),
    host: z.string().trim().max(200),
    port: int(1, 65535, 'port'),
    auth_protocol: z.string(),
    return_path: z.string(),
    username: z.string().max(200),
    password: z.string().max(200),
    tls_enabled: z.boolean(),
    tls_skip_verify: z.boolean(),
    scan_interval: duration('scan_interval'),
  })

  const action = z.object({ count: int(1, 1000, 'count'), action: z.enum(bounceActions) })
  const flag = z.boolean()
  const text = (max = 300) => z.string().trim().max(max)
  const optionalURL = (name: string) => text().refine((v) => !v || urlPattern.test(v), bad(name))

  return z
    .object({
      app: z.object({
        site_name: text().min(1, bad('site_name')),
        root_url: text().regex(urlPattern, bad('root_url')),
        logo_url: optionalURL('logo_url'),
        favicon_url: optionalURL('favicon_url'),
        from_email: text().refine((v) => !v || /^((.+?)\s)?<(.+?)@(.+?)>$/.test(v) || emailLike.test(v), bad('from_email')),
        notify_emails: z.array(z.string()),
        enable_public_subscription_page: flag,
        enable_public_archive: flag,
        enable_public_archive_rss_content: flag,
        show_optin_page: flag,
        send_optin_confirmation: flag,
        check_updates: flag,
        lang: z.string(),
        batch_size: int(1, 100000, 'batch_size'),
        concurrency: int(1, 10000, 'concurrency'),
        max_send_errors: int(0, 100000, 'max_send_errors'),
        message_rate: int(1, 100000, 'message_rate'),
        cache_slow_queries: flag,
        cache_slow_queries_interval: z.string().trim(),
        message_sliding_window: flag,
        message_sliding_window_duration: z.string().trim(),
        message_sliding_window_rate: int(1, 10000000, 'message_sliding_window_rate'),
      }),
      privacy: z.object({
        individual_tracking: flag,
        disable_tracking: flag,
        unsubscribe_header: flag,
        allow_blocklist: flag,
        allow_preferences: flag,
        allow_export: flag,
        allow_wipe: flag,
        exportable: z.array(z.string()),
        record_optin_ip: flag,
        // One entry per line in the form; arrays on the wire.
        domain_blocklist: z.string(),
        domain_allowlist: z.string(),
      }),
      security: z.object({
        captcha: z.object({
          altcha: z.object({ enabled: flag, complexity: int(1000, 1000000, 'complexity') }),
          hcaptcha: z.object({ enabled: flag, key: text(200), secret: z.string().max(200) }),
        }),
        oidc: z.object({
          enabled: flag,
          provider_url: text(),
          provider_name: text(200),
          client_id: text(200),
          client_secret: z.string().max(200),
          auto_create_users: flag,
          default_user_role_id: z.number().nullable(),
          default_list_role_id: z.number().nullable(),
        }),
        trusted_urls: z.string(),
      }),
      upload: z.object({
        provider: z.enum(['filesystem', 's3']),
        extensions: z.array(z.string()),
        filesystem: z.object({ upload_path: text(200), upload_uri: text(200) }),
        s3: z.object({
          url: text(200),
          public_url: text(200),
          aws_access_key_id: text(200),
          aws_default_region: text(200),
          aws_secret_access_key: z.string().max(200),
          bucket: text(200),
          bucket_domain: z.string(),
          bucket_path: text(200),
          bucket_type: z.enum(['private', 'public']),
          expiry: z.string().trim().refine((v) => !v || durationPattern.test(v), bad('expiry')),
        }),
      }),
      smtp: z.array(smtp),
      messengers: z.array(messenger),
      bounce: z.object({
        enabled: flag,
        webhooks_enabled: flag,
        actions: z.object({ soft: action, hard: action, complaint: action }),
        ses_enabled: flag,
        sendgrid_enabled: flag,
        sendgrid_key: z.string().max(200),
        azure: z.object({ enabled: flag, shared_secret: z.string(), shared_secret_header: z.string() }),
        postmark: z.object({ enabled: flag, username: z.string(), password: z.string() }),
        forwardemail: z.object({ enabled: flag, key: z.string() }),
        lettermint: z.object({ enabled: flag, key: z.string() }),
        mailboxes: z.array(mailbox),
      }),
      maintenance: z.object({ db: z.object({ vacuum: flag, vacuum_cron_interval: z.string() }) }),
      appearance: z.object({
        admin: z.object({ custom_css: z.string(), custom_js: z.string() }),
        public: z.object({ custom_css: z.string(), custom_js: z.string() }),
      }),
    })
    .superRefine((v, ctx) => {
      const add = (path: (string | number)[], name: string) => ctx.addIssue({ code: 'custom', path, message: bad(name) })

      if (v.app.cache_slow_queries && !cronPattern.test(v.app.cache_slow_queries_interval)) add(['app', 'cache_slow_queries_interval'], 'cron')
      if (v.app.message_sliding_window && !durationPattern.test(v.app.message_sliding_window_duration)) {
        add(['app', 'message_sliding_window_duration'], 'duration')
      }
      if (v.maintenance.db.vacuum && !cronPattern.test(v.maintenance.db.vacuum_cron_interval)) add(['maintenance', 'db', 'vacuum_cron_interval'], 'cron')

      if (v.upload.provider === 'filesystem') {
        if (!v.upload.filesystem.upload_path) add(['upload', 'filesystem', 'upload_path'], 'upload_path')
        if (!/^\/.+/.test(v.upload.filesystem.upload_uri)) add(['upload', 'filesystem', 'upload_uri'], 'upload_uri')
      } else {
        if (!urlPattern.test(v.upload.s3.url)) add(['upload', 's3', 'url'], 'url')
        const pub = v.upload.s3.public_url
        if (pub && !/^(https?:\/\/.+|\/.+)$/.test(pub)) add(['upload', 's3', 'public_url'], 'public_url')
      }

      const o = v.security.oidc
      if (o.enabled) {
        if (!urlPattern.test(o.provider_url)) add(['security', 'oidc', 'provider_url'], 'provider_url')
        if (!o.client_id) add(['security', 'oidc', 'client_id'], 'client_id')
        if (!o.client_secret) add(['security', 'oidc', 'client_secret'], 'client_secret')
      }
      const h = v.security.captcha.hcaptcha
      if (h.enabled && !h.key) add(['security', 'captcha', 'hcaptcha', 'key'], 'key')
      if (h.enabled && !h.secret) add(['security', 'captcha', 'hcaptcha', 'secret'], 'secret')

      v.smtp.forEach((s, i) => {
        if (s.enabled && !s.host) add(['smtp', i, 'host'], 'host')
      })
      v.bounce.mailboxes.forEach((m, i) => {
        if (v.bounce.enabled && m.enabled && !m.host) add(['bounce', 'mailboxes', i, 'host'], 'host')
      })
    })
}

export type SettingsForm = z.infer<ReturnType<typeof settingsSchema>>
export type SmtpForm = SettingsForm['smtp'][number]
export type MessengerForm = SettingsForm['messengers'][number]

// --- Flat API <-> nested form ---------------------------------------------------------------------

/** Every key of the settings object. A test keeps this in step with what the server sends. */
export const SETTING_KEYS = [
  'app.site_name', 'app.root_url', 'app.logo_url', 'app.favicon_url', 'app.from_email', 'app.notify_emails',
  'app.enable_public_subscription_page', 'app.enable_public_archive', 'app.enable_public_archive_rss_content',
  'app.show_optin_page', 'app.send_optin_confirmation', 'app.check_updates', 'app.lang', 'app.batch_size',
  'app.concurrency', 'app.max_send_errors', 'app.message_rate', 'app.cache_slow_queries', 'app.cache_slow_queries_interval',
  'app.message_sliding_window', 'app.message_sliding_window_duration', 'app.message_sliding_window_rate',
  'privacy.individual_tracking', 'privacy.disable_tracking', 'privacy.unsubscribe_header', 'privacy.allow_blocklist',
  'privacy.allow_preferences', 'privacy.allow_export', 'privacy.allow_wipe', 'privacy.exportable', 'privacy.record_optin_ip',
  'privacy.domain_blocklist', 'privacy.domain_allowlist',
  'security.captcha', 'security.oidc', 'security.trusted_urls',
  'upload.provider', 'upload.extensions', 'upload.filesystem.upload_path', 'upload.filesystem.upload_uri', 'upload.s3.url',
  'upload.s3.public_url', 'upload.s3.aws_access_key_id', 'upload.s3.aws_default_region', 'upload.s3.aws_secret_access_key',
  'upload.s3.bucket', 'upload.s3.bucket_domain', 'upload.s3.bucket_path', 'upload.s3.bucket_type', 'upload.s3.expiry',
  'smtp', 'messengers',
  'bounce.enabled', 'bounce.webhooks_enabled', 'bounce.actions', 'bounce.ses_enabled', 'bounce.sendgrid_enabled',
  'bounce.sendgrid_key', 'bounce.azure', 'bounce.postmark', 'bounce.forwardemail', 'bounce.lettermint', 'bounce.mailboxes',
  'maintenance.db',
  'appearance.admin.custom_css', 'appearance.admin.custom_js', 'appearance.public.custom_css', 'appearance.public.custom_js',
] as const

/** Keys the server omits when empty. */
const OPTIONAL_STRINGS: string[] = ['upload.s3.aws_secret_access_key']

type Obj = Record<string, unknown>

// structuredClone refuses Vue's reactive proxies (what the form's values are); settings are plain JSON.
const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

function setPath(root: Obj, path: string[], value: unknown) {
  let cur = root
  for (const k of path.slice(0, -1)) cur = (cur[k] ??= {}) as Obj
  cur[path[path.length - 1]] = value
}
function getPath(root: Obj, path: string[]): unknown {
  return path.reduce<unknown>((cur, k) => (cur as Obj | undefined)?.[k], root)
}

const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean)
let keyCounter = 0
const newKey = () => `k${++keyCounter}`

export function parseEmailHeaders(s: string): Record<string, string>[] | null {
  if (!s.trim()) return []
  try {
    const v: unknown = JSON.parse(s)
    return Array.isArray(v) && v.every((h) => h && typeof h === 'object' && !Array.isArray(h)) ? (v as Record<string, string>[]) : null
  } catch {
    return null
  }
}

export function toForm(s: Settings): SettingsForm {
  const f: Obj = {}
  for (const key of SETTING_KEYS) {
    const v = (s as Record<string, unknown>)[key]
    // The server leaves an unset S3 secret out of the response altogether.
    setPath(f, key.split('.'), v === undefined && OPTIONAL_STRINGS.includes(key) ? '' : clone(v))
  }

  const privacy = f.privacy as Obj
  privacy.domain_blocklist = ((privacy.domain_blocklist as string[]) ?? []).join('\n')
  privacy.domain_allowlist = ((privacy.domain_allowlist as string[]) ?? []).join('\n')
  const security = f.security as Obj
  security.trusted_urls = ((security.trusted_urls as string[]) ?? []).join('\n')

  for (const item of (f.smtp as Obj[]) ?? []) {
    item._key = newKey()
    item.strEmailHeaders = (item.email_headers as unknown[] | undefined)?.length ? JSON.stringify(item.email_headers, null, 4) : ''
    item.from_addresses ??= []
    delete item.email_headers
  }
  for (const item of (f.messengers as Obj[]) ?? []) item._key = newKey()
  for (const item of ((f.bounce as Obj).mailboxes as Obj[]) ?? []) item._key = newKey()
  // The server leaves an empty password out of each block altogether.
  for (const list of [f.smtp, f.messengers, (f.bounce as Obj).mailboxes] as Obj[][]) for (const item of list ?? []) item.password ??= ''
  return f as unknown as SettingsForm
}

const SMTP_FIELDS = [
  'name', 'uuid', 'enabled', 'host', 'hello_hostname', 'port', 'auth_protocol', 'username', 'password', 'max_conns',
  'max_msg_retries', 'msg_retry_delay', 'idle_timeout', 'wait_timeout', 'tls_type', 'tls_skip_verify', 'from_addresses',
] as const
const MESSENGER_FIELDS = ['uuid', 'enabled', 'name', 'root_url', 'username', 'password', 'max_conns', 'timeout', 'max_msg_retries'] as const
const MAILBOX_FIELDS = [
  'uuid', 'enabled', 'type', 'host', 'port', 'auth_protocol', 'return_path', 'username', 'password', 'tls_enabled',
  'tls_skip_verify', 'scan_interval',
] as const

const pick = (o: Obj, fields: readonly string[]) => Object.fromEntries(fields.map((k) => [k, o[k]]))

/** Secrets as they are in the form: [path, label shown when the secret is half-edited]. */
export function secretPaths(f: SettingsForm): [string[], string][] {
  return [
    ...f.smtp.map((_, i): [string[], string] => [['smtp', String(i), 'password'], `smtp #${i + 1}`]),
    ...f.bounce.mailboxes.map((_, i): [string[], string] => [['bounce', 'mailboxes', String(i), 'password'], `bounce #${i + 1}`]),
    ['upload.s3.aws_secret_access_key'.split('.'), 's3'],
    [['bounce', 'sendgrid_key'], 'sendgrid'],
    [['bounce', 'azure', 'shared_secret'], 'azure shared secret'],
    [['security', 'captcha', 'hcaptcha', 'secret'], 'captcha'],
    [['security', 'oidc', 'client_secret'], 'oidc'],
    [['bounce', 'postmark', 'password'], 'postmark'],
    [['bounce', 'forwardemail', 'key'], 'forwardemail'],
    [['bounce', 'lettermint', 'key'], 'lettermint'],
    ...f.messengers.map((_, i): [string[], string] => [['messengers', String(i), 'password'], `messenger #${i + 1}`]),
  ]
}

/** The name of the first secret that was edited but still contains bullets, if any. */
export function halfEditedSecret(f: SettingsForm): string | null {
  for (const [path, label] of secretPaths(f)) {
    const v = getPath(f as unknown as Obj, path) as string | undefined
    if (hasMask(v) && !isMasked(v)) return label
  }
  return null
}

/** Back to the API's shape. Untouched (masked) secrets go out empty, which the server reads as "keep". */
export function toRequest(f: SettingsForm): Settings {
  const form = clone(f) as unknown as Obj
  for (const [path] of secretPaths(f)) {
    if (isMasked(getPath(form, path) as string)) setPath(form, path, '')
  }

  const privacy = form.privacy as Obj
  privacy.domain_blocklist = lines((privacy.domain_blocklist as string).toLowerCase())
  privacy.domain_allowlist = lines((privacy.domain_allowlist as string).toLowerCase())
  ;(form.security as Obj).trusted_urls = lines((form.security as Obj).trusted_urls as string)

  form.smtp = ((form.smtp as Obj[]) ?? []).map((s) => ({
    ...pick(s, SMTP_FIELDS),
    host: String(s.host ?? '').trim(),
    email_headers: parseEmailHeaders(String(s.strEmailHeaders ?? '')) ?? [],
  }))
  form.messengers = ((form.messengers as Obj[]) ?? []).map((m) => pick(m, MESSENGER_FIELDS))
  const bounce = form.bounce as Obj
  bounce.mailboxes = ((bounce.mailboxes as Obj[]) ?? []).map((m) => ({ ...pick(m, MAILBOX_FIELDS), host: String(m.host ?? '').trim() }))

  const out: Obj = {}
  for (const key of SETTING_KEYS) out[key] = getPath(form, key.split('.'))
  return out as unknown as Settings
}

// --- Defaults for new blocks ------------------------------------------------------------------------

export const emptySmtp = (): SmtpForm => ({
  _key: newKey(), uuid: '', name: '', enabled: true, host: '', hello_hostname: '', port: 587, auth_protocol: 'none', username: '',
  password: '', strEmailHeaders: '', max_conns: 10, max_msg_retries: 2, msg_retry_delay: '10ms', idle_timeout: '15s',
  wait_timeout: '5s', tls_type: 'STARTTLS', tls_skip_verify: false, from_addresses: [],
})

export const emptyMessenger = (): MessengerForm => ({
  _key: newKey(), uuid: '', enabled: true, name: '', root_url: '', username: '', password: '', max_conns: 25, max_msg_retries: 2, timeout: '5s',
})

/** One-click presets for the popular SMTP providers. */
export const smtpPresets: Record<string, Pick<SmtpForm, 'host' | 'port' | 'auth_protocol' | 'tls_type'>> = {
  gmail: { host: 'smtp.gmail.com', port: 465, auth_protocol: 'login', tls_type: 'TLS' },
  ses: { host: 'email-smtp.YOUR-REGION.amazonaws.com', port: 465, auth_protocol: 'login', tls_type: 'TLS' },
  azure: { host: 'smtp.azurecomm.net', port: 587, auth_protocol: 'login', tls_type: 'STARTTLS' },
  mailjet: { host: 'in-v3.mailjet.com', port: 465, auth_protocol: 'cram', tls_type: 'TLS' },
  mailgun: { host: 'smtp.mailgun.org', port: 465, auth_protocol: 'login', tls_type: 'TLS' },
  sendgrid: { host: 'smtp.sendgrid.net', port: 465, auth_protocol: 'login', tls_type: 'TLS' },
  postmark: { host: 'smtp.postmarkapp.com', port: 587, auth_protocol: 'cram', tls_type: 'STARTTLS' },
  forwardemail: { host: 'smtp.forwardemail.net', port: 465, auth_protocol: 'login', tls_type: 'TLS' },
  lettermint: { host: 'smtp.lettermint.co', port: 465, auth_protocol: 'login', tls_type: 'TLS' },
}
export const smtpPresetLabels: Record<keyof typeof smtpPresets, string> = {
  gmail: 'Gmail', ses: 'Amazon SES', azure: 'Azure ACS', mailjet: 'Mailjet', mailgun: 'Mailgun', sendgrid: 'Sendgrid',
  postmark: 'Postmark', forwardemail: 'Forward Email', lettermint: 'Lettermint',
}

export const oidcProviders = {
  google: { name: 'Google', url: 'https://accounts.google.com' },
  microsoft: { name: 'Microsoft', url: 'https://login.microsoftonline.com/{TENANT_HERE}/v2.0' },
  apple: { name: 'Apple', url: 'https://appleid.apple.com' },
} as const
