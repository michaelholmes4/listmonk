import { z } from 'zod'
import type { Subscriber } from '@/api/types'

type T = (key: string) => string

/** Parses the attributes textarea. Returns the map, or null when it isn't a JSON object. */
export function parseAttribs(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return {}
  try {
    const v: unknown = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const subscriberSchema = (t: T) =>
  z.object({
    email: z.string().trim().min(1, t('subscribers.invalidEmail')).email(t('subscribers.invalidEmail')).max(200),
    name: z.string().trim().max(200),
    status: z.enum(['enabled', 'blocklisted']),
    lists: z.array(z.number()),
    preconfirm: z.boolean(),
    // Kept as text so the user's formatting survives; validated here, parsed on submit.
    attribs: z.string().refine((v) => parseAttribs(v) !== null, t('subscribers.invalidJSON')),
  })

export type SubscriberForm = z.infer<ReturnType<typeof subscriberSchema>>

export const emptySubscriber = (): SubscriberForm => ({
  email: '',
  name: '',
  status: 'enabled',
  lists: [],
  preconfirm: false,
  attribs: '{}',
})

export const toForm = (s: Subscriber): SubscriberForm => ({
  email: s.email ?? '',
  name: s.name ?? '',
  // `disabled` exists in the model but the form only offers the two states the classic UI does.
  status: s.status === 'blocklisted' ? 'blocklisted' : 'enabled',
  lists: (s.lists ?? []).map((l) => l.id!),
  preconfirm: false,
  attribs: JSON.stringify(s.attribs ?? {}, null, 2),
})
