import { z } from 'zod'
import type { Template } from '@/api/types'

type T = (key: string) => string

export const templateTypes = ['campaign', 'campaign_visual', 'tx'] as const
export type TemplateType = (typeof templateTypes)[number]

/** Campaign templates must contain the placeholder where each campaign's body goes. */
export const hasContentPlaceholder = (body: string) => /{{(\s+)?template\s+?"content"(\s+)?\.(\s+)?}}/.test(body)

export const templateSchema = (t: T) =>
  z
    .object({
      name: z.string().trim().min(1, t('templates.fieldInvalidName')).max(200),
      type: z.enum(templateTypes),
      subject: z.string().max(200),
      body: z.string().min(1, t('web.templates.bodyRequired')),
      bodySource: z.string().nullable(),
    })
    .superRefine((v, ctx) => {
      if (v.type === 'tx' && !v.subject.trim()) {
        ctx.addIssue({ code: 'custom', path: ['subject'], message: t('web.templates.subjectRequired') })
      }
    })

export type TemplateForm = z.infer<ReturnType<typeof templateSchema>>

export const emptyTemplate = (): TemplateForm => ({ name: '', type: 'campaign', subject: '', body: '', bodySource: null })

export const toForm = (tpl: Template): TemplateForm => ({
  name: tpl.name ?? '',
  type: (tpl.type as TemplateType) ?? 'campaign',
  subject: tpl.subject ?? '',
  body: tpl.body ?? '',
  bodySource: tpl.body_source ?? null,
})
