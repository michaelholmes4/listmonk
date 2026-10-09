import { MailOpen, MousePointerClick } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { format } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { MessageLogRow } from '@/api/types'
import { Badge } from '@/components/ui/badge'

type T = (key: string, ...args: unknown[]) => string

interface Options {
  t: T
  /** The subscriber tab already says who the messages are for. */
  showTo?: boolean
}

const muted = (text: string, cls = '') => h('span', { class: ['text-muted-foreground', cls] }, text)

/** Where a message came from: the type, and the campaign or automation behind it. */
function sourceCell(m: MessageLogRow, t: T) {
  const name = m.campaign_name || m.automation_name
  const to = m.automation_id ? { name: 'automation', params: { id: m.automation_id } } : m.campaign_id ? { name: 'campaign', params: { id: m.campaign_id } } : undefined
  return h('div', { class: 'flex min-w-0 flex-col items-start gap-0.5' }, [
    h(Badge, { variant: 'secondary' }, () => t(`web.messages.sources.${m.source}`)),
    name && to ? h(RouterLink, { to, class: 'max-w-48 truncate text-xs text-muted-foreground hover:underline' }, () => name) : null,
  ])
}

function statusCell(m: MessageLogRow, t: T) {
  const failed = m.status === 'failed'
  const state = failed ? 'failed' : m.bounced ? 'bounced' : 'sent'
  return h('div', { class: 'flex min-w-0 flex-col items-start gap-0.5' }, [
    h('div', { class: 'flex items-center gap-1.5' }, [
      h(Badge, { variant: failed ? 'destructive' : m.bounced ? 'warning' : 'success' }, () => t(`web.messages.status.${state}`)),
      m.opened ? h(MailOpen, { class: 'size-3.5 text-muted-foreground', 'aria-label': t('web.messages.opened') }) : null,
      m.clicked ? h(MousePointerClick, { class: 'size-3.5 text-muted-foreground', 'aria-label': t('web.messages.clicked') }) : null,
    ]),
    failed && m.error ? h('span', { class: 'max-w-64 truncate text-xs text-destructive', title: m.error }, m.error) : null,
  ])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns({ t, showTo = true }: Options): ColumnDef<any, MessageLogRow>[] {
  return [
    {
      id: 'created_at',
      header: () => t('web.messages.sentAt'),
      cell: ({ row }) => h('span', { class: 'whitespace-nowrap' }, format(new Date(row.original.created_at!), 'PP p')),
    },
    ...(showTo
      ? [
          {
            id: 'to',
            header: () => t('web.messages.to'),
            cell: ({ row }: { row: { original: MessageLogRow } }) => {
              const m = row.original
              const first = m.to?.[0] ?? ''
              const extra = (m.to?.length ?? 0) - 1
              return h('div', { class: 'flex min-w-0 items-center gap-1' }, [
                m.subscriber_id
                  ? h(RouterLink, { to: { name: 'subscriber', params: { id: m.subscriber_id } }, class: 'truncate font-medium hover:underline' }, () => first)
                  : h('span', { class: 'truncate' }, first),
                extra > 0 ? muted(`+${extra}`, 'text-xs') : null,
              ])
            },
          },
        ]
      : []),
    {
      id: 'subject',
      header: () => t('web.messages.subject'),
      cell: ({ row }) =>
        h(
          RouterLink,
          { to: { name: 'message', params: { id: row.original.id } }, class: 'block max-w-md truncate hover:underline', 'data-cy': 'message-link' },
          () => row.original.subject || t('web.messages.noSubject'),
        ),
    },
    { id: 'source', header: () => t('web.messages.type'), cell: ({ row }) => sourceCell(row.original, t) },
    { id: 'status', header: () => t('globals.fields.status'), cell: ({ row }) => statusCell(row.original, t) },
  ]
}
