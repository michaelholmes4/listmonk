import type { ColumnDef } from '@tanstack/vue-table'
import { format } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { List } from '@/api/types'
import { selectColumn } from '@/components/datatable/selectColumn'
import { Badge } from '@/components/ui/badge'
import RowActions from './RowActions.vue'

type T = (key: string, ...args: unknown[]) => string

interface Handlers {
  t: T
  n: (v: number) => string
  canViewSubscribers: boolean
  canManage: (l: List) => boolean
  onEdit: (l: List) => void
  onDelete: (l: List) => void
  onOptinCampaign: (l: List) => void
}

const date = (iso?: string) => (iso ? format(new Date(iso), 'PP') : '')

/** Per-status counts shown under the total. Single opt-in lists have no confirmed/unconfirmed. */
export function visibleStatuses(l: List): [string, number][] {
  const out = { ...l.subscriber_statuses }
  if (l.optin === 'single') {
    delete out.unconfirmed
    delete out.confirmed
  }
  return Object.entries(out)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns(c: Handlers): ColumnDef<any, List>[] {
  const { t, n } = c
  return [
    selectColumn<List>(t('web.common.selectAll'), (l) => l.name ?? ''),
    {
      id: 'name',
      accessorKey: 'name',
      header: () => t('globals.fields.name'),
      cell: ({ row }) => {
        const l = row.original
        return h('div', { class: 'space-y-1' }, [
          h(RouterLink, { to: { name: 'list', params: { id: l.id } }, class: 'font-medium hover:underline' }, () => l.name),
          (l.tags ?? []).length
            ? h('div', { class: 'flex flex-wrap gap-1' }, (l.tags ?? []).map((tag) => h(Badge, { key: tag, variant: 'outline' }, () => tag)))
            : null,
        ])
      },
    },
    {
      id: 'type',
      accessorKey: 'type',
      header: () => t('globals.fields.type'),
      cell: ({ row }) => {
        const l = row.original
        return h('div', { class: 'flex flex-wrap items-center gap-1.5' }, [
          h(Badge, { variant: l.type === 'public' ? 'success' : 'secondary' }, () => t(`lists.types.${l.type}`)),
          h(Badge, { variant: 'outline' }, () => t(`lists.optins.${l.optin}`)),
          l.optin === 'double' && c.canManage(l)
            ? h(
                'button',
                { type: 'button', class: 'text-xs text-primary hover:underline', onClick: () => c.onOptinCampaign(l) },
                t('lists.sendOptinCampaign'),
              )
            : null,
        ])
      },
    },
    {
      id: 'subscriber_count',
      accessorKey: 'subscriber_count',
      header: () => t('globals.terms.subscribers'),
      cell: ({ row }) => {
        const l = row.original
        const count = n(l.subscriber_count ?? 0)
        return h('div', { class: 'space-y-1 tabular-nums' }, [
          c.canViewSubscribers
            ? h(RouterLink, { to: { name: 'subscribers-list', params: { listID: l.id } }, class: 'font-medium hover:underline' }, () => count)
            : h('span', count),
          ...visibleStatuses(l).map(([status, num]) =>
            h('div', { key: status, class: 'flex gap-1.5 text-xs text-muted-foreground' }, [
              h('span', t(`subscribers.status.${status}`)),
              c.canViewSubscribers
                ? h(
                    RouterLink,
                    {
                      to: { name: 'subscribers-list', params: { listID: l.id }, query: { subscription_status: status } },
                      class: 'hover:text-foreground hover:underline',
                    },
                    () => n(num),
                  )
                : h('span', n(num)),
            ]),
          ),
        ])
      },
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: () => t('globals.fields.createdAt'),
      cell: ({ row }) => date(row.original.created_at),
    },
    {
      id: 'updated_at',
      accessorKey: 'updated_at',
      header: () => t('globals.fields.updatedAt'),
      cell: ({ row }) => date(row.original.updated_at),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => '',
      cell: ({ row }) =>
        h(
          'div',
          { class: 'flex justify-end' },
          h(RowActions, {
            id: row.original.id!,
            onEdit: () => c.onEdit(row.original),
            onDelete: () => c.onDelete(row.original),
          }),
        ),
    },
  ]
}
