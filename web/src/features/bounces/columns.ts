import type { ColumnDef } from '@tanstack/vue-table'
import { format } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { BounceRecord } from '@/api/types'
import { selectColumn } from '@/components/datatable/selectColumn'
import { Badge } from '@/components/ui/badge'
import RowActions from './RowActions.vue'

type T = (key: string, ...args: unknown[]) => string

interface Handlers {
  t: T
  canManage: boolean
  onFilterCampaign: (id: number) => void
  onFilterSource: (source: string) => void
  onDetails: (b: BounceRecord) => void
  onDelete: (b: BounceRecord) => void
}

const link = (label: string, onClick: () => void) =>
  h('button', { type: 'button', class: 'hover:underline', onClick }, label)

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns(c: Handlers): ColumnDef<any, BounceRecord>[] {
  const { t } = c
  return [
    ...(c.canManage ? [selectColumn<BounceRecord>(t('web.common.selectAll'), (b) => b.email ?? '')] : []),
    {
      id: 'email',
      accessorKey: 'email',
      header: () => t('subscribers.email'),
      cell: ({ row }) => {
        const b = row.original
        return h('div', { class: 'flex items-center gap-2' }, [
          h(
            RouterLink,
            {
              to: { name: 'subscriber', params: { id: b.subscriber_id } },
              class: ['font-medium hover:underline', b.subscriber_status === 'blocklisted' && 'text-destructive line-through'],
            },
            () => b.email,
          ),
          b.subscriber_status && b.subscriber_status !== 'enabled'
            ? h(Badge, { variant: b.subscriber_status === 'blocklisted' ? 'destructive' : 'warning' }, () =>
                t(`subscribers.status.${b.subscriber_status}`),
              )
            : null,
        ])
      },
    },
    {
      id: 'campaign_name',
      header: () => t('globals.terms.campaign', 1),
      cell: ({ row }) => {
        const camp = row.original.campaign
        return camp ? link(camp.name ?? '', () => c.onFilterCampaign(camp.id!)) : h('span', { class: 'text-muted-foreground' }, '-')
      },
    },
    {
      id: 'source',
      accessorKey: 'source',
      header: () => t('bounces.source'),
      cell: ({ row }) => link(row.original.source ?? '', () => c.onFilterSource(row.original.source ?? '')),
    },
    {
      id: 'type',
      accessorKey: 'type',
      header: () => t('globals.fields.type'),
      cell: ({ row }) =>
        h(Badge, { variant: row.original.type === 'hard' ? 'destructive' : row.original.type === 'complaint' ? 'warning' : 'secondary' }, () =>
          t(`bounces.${row.original.type}`),
        ),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: () => t('globals.fields.createdAt'),
      cell: ({ row }) => (row.original.created_at ? format(new Date(row.original.created_at), 'PP p') : ''),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => '',
      cell: ({ row }) =>
        h(
          'div',
          { class: 'flex justify-end' },
          h(RowActions, { onDetails: () => c.onDetails(row.original), onDelete: () => c.onDelete(row.original) }),
        ),
    },
  ]
}
