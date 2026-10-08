import { z } from 'zod'
import type { List } from '@/api/types'

type T = (key: string) => string

export const listSchema = (t: T) =>
  z.object({
    name: z.string().trim().min(1, t('lists.invalidName')).max(200),
    type: z.enum(['private', 'public']),
    optin: z.enum(['single', 'double']),
    tags: z.array(z.string()),
    description: z.string().max(2000),
    archived: z.boolean(),
  })

export type ListForm = z.infer<ReturnType<typeof listSchema>>

export const emptyList = (): ListForm => ({
  name: '',
  type: 'private',
  optin: 'single',
  tags: [],
  description: '',
  archived: false,
})

export const toForm = (l: List): ListForm => ({
  name: l.name ?? '',
  type: l.type === 'public' ? 'public' : 'private',
  optin: l.optin === 'double' ? 'double' : 'single',
  tags: l.tags ?? [],
  description: l.description ?? '',
  archived: l.status === 'archived',
})
