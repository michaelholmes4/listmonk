import { z } from 'zod'
import type { Campaign, NewCampaign } from '@/api/types'

type T = (key: string) => string

export const contentTypes = ['richtext', 'html', 'markdown', 'plain', 'visual'] as const
export type ContentType = (typeof contentTypes)[number]

/** Parses a JSON text field, returning undefined when it is invalid or the wrong shape. */
function parseJSON<T>(raw: string, ok: (v: unknown) => v is T, empty: T): T | undefined {
  if (!raw.trim()) return empty
  try {
    const v: unknown = JSON.parse(raw)
    return ok(v) ? v : undefined
  } catch {
    return undefined
  }
}
const isArray = (v: unknown): v is unknown[] => Array.isArray(v)
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export const parseHeaders = (raw: string) => parseJSON(raw, isArray, [])
export const parseObject = (raw: string) => parseJSON(raw, isObject, {})

/** `<input type="datetime-local">` value (local time, no zone) <-> ISO string. */
export const toLocalInput = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = (local: string): string | null => (local ? new Date(local).toISOString() : null)

export const campaignSchema = (t: T) =>
  z
    .object({
      name: z.string().trim().min(1, t('campaigns.fieldInvalidName')).max(200),
      subject: z.string().trim().min(1, t('campaigns.fieldInvalidSubject')).max(5000),
      fromEmail: z.string().trim().min(1, t('campaigns.fieldInvalidFromEmail')).max(200),
      lists: z.array(z.number()).min(1, t('campaigns.fieldInvalidListIDs')),
      messenger: z.string().min(1),
      tags: z.array(z.string()),
      sendLater: z.boolean(),
      // Local "YYYY-MM-DDTHH:mm" from the datetime input; required only when sending later.
      sendAt: z.string(),
      headers: z.string(),
      contentType: z.enum(contentTypes),
      body: z.string(),
      bodySource: z.string().nullable(),
      templateId: z.number().nullable(),
      altbody: z.string().nullable(),
      attribs: z.string(),
      media: z.array(z.object({ id: z.number(), filename: z.string() })),
      archive: z.boolean(),
      archiveSlug: z.string(),
      archiveTemplateId: z.number().nullable(),
      archiveMeta: z.string(),
    })
    .superRefine((v, ctx) => {
      const bad = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
      if (v.sendLater && !v.sendAt) bad('sendAt', t('campaigns.fieldInvalidSendAt'))
      if (parseHeaders(v.headers) === undefined) bad('headers', t('web.campaigns.invalidHeaders'))
      if (parseObject(v.attribs) === undefined) bad('attribs', t('subscribers.invalidJSON'))
      if (v.archive && parseObject(v.archiveMeta) === undefined) bad('archiveMeta', t('subscribers.invalidJSON'))
    })

export type CampaignForm = z.infer<ReturnType<typeof campaignSchema>>

export const emptyCampaign = (fromEmail = '', lists: number[] = []): CampaignForm => ({
  name: '',
  subject: '',
  fromEmail,
  lists,
  messenger: 'email',
  tags: [],
  sendLater: false,
  sendAt: '',
  headers: '[]',
  contentType: 'richtext',
  body: '',
  bodySource: null,
  templateId: null,
  altbody: null,
  attribs: '{}',
  media: [],
  archive: false,
  archiveSlug: '',
  archiveTemplateId: null,
  archiveMeta: '{}',
})

const pretty = (v: unknown, fallback: string) => (v == null ? fallback : JSON.stringify(v, null, 2))

export const toForm = (c: Campaign): CampaignForm => ({
  name: c.name ?? '',
  subject: c.subject ?? '',
  fromEmail: c.from_email ?? '',
  lists: (c.lists ?? []).map((l) => l.id!),
  messenger: c.messenger ?? 'email',
  tags: c.tags ?? [],
  sendLater: !!c.send_at,
  sendAt: toLocalInput(c.send_at),
  headers: pretty(c.headers, '[]'),
  contentType: (c.content_type as ContentType) ?? 'richtext',
  body: c.body ?? '',
  bodySource: c.body_source ?? null,
  templateId: c.template_id ?? null,
  altbody: c.altbody ?? null,
  attribs: pretty(c.attribs, '{}'),
  // A media file that was deleted after being attached has no id; keep it visible but marked.
  media: (c.media ?? []).map((m) => ({ id: m.id ?? 0, filename: m.id ? (m.filename ?? '') : `❌ ${m.filename ?? ''}` })),
  archive: !!c.archive,
  archiveSlug: c.archive_slug ?? '',
  archiveTemplateId: c.archive_template_id ?? null,
  archiveMeta: pretty(c.archive_meta, '{}'),
})

/** The create/update request. Content fields are left out on create (the editor comes next). */
export function toRequest(v: CampaignForm, opts: { create?: boolean } = {}): NewCampaign {
  const base: NewCampaign = {
    name: v.name,
    subject: v.subject,
    lists: v.lists,
    from_email: v.fromEmail,
    messenger: v.messenger,
    type: 'regular',
    tags: v.tags,
    send_later: v.sendLater,
    send_at: v.sendLater ? fromLocalInput(v.sendAt) : null,
    headers: parseHeaders(v.headers) as NewCampaign['headers'],
    content_type: v.contentType,
    media: v.media.filter((m) => m.id).map((m) => m.id),
  }
  if (opts.create) return base
  return {
    ...base,
    template_id: v.templateId ?? undefined,
    body: v.body,
    body_source: v.bodySource ?? undefined,
    // Plain-text campaigns have no alternative body.
    altbody: v.contentType !== 'plain' ? (v.altbody ?? undefined) : undefined,
    archive: v.archive,
    archive_slug: v.archiveSlug || undefined,
    archive_template_id: v.archiveTemplateId ?? undefined,
    archive_meta: parseObject(v.archiveMeta),
  }
}
