import type { ColumnDef } from '@tanstack/vue-table'
import { format } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { Subscriber } from '@/api/types'
import CopyText from '@/components/CopyText.vue'
import { selectColumn } from '@/components/datatable/selectColumn'
import { Badge } from '@/components/ui/badge'
import RowActions from './RowActions.vue'

type T = (key: string, ...args: unknown[]) => string

interface Handlers {
  t: T
  onEdit: (s: Subscriber) => void
  onDelete: (s: Subscriber) => void
}

const date = (iso?: string) => (iso ? format(new Date(iso), 'PP') : '')

export const subscriberStatusVariant = (s?: string) => (s === 'blocklisted' ? 'destructive' : s === 'unsubscribed' ? 'warning' : 'success')

/** How many list badges a row shows before "+N". */
const LISTS = 3

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns({ t, onEdit, onDelete }: Handlers): ColumnDef<any, Subscriber>[] {
  return [
    selectColumn<Subscriber>(t('web.common.selectAll'), (s) => s.email ?? ''),
    {
      id: 'email',
      accessorKey: 'email',
      header: () => t('subscribers.email'),
      cell: ({ row }) => {
        const s = row.original
        // The copy button only shows on hover/focus of the row, so it doesn't add noise to every line.
        return h(
          CopyText,
          { text: s.email ?? '', class: '[&>button]:opacity-0 group-hover/row:[&>button]:opacity-100 [&>button]:focus-visible:opacity-100' },
          () =>
            h(
              RouterLink,
              {
                to: { name: 'subscriber', params: { id: s.id } },
                class: ['font-medium hover:underline', s.status === 'blocklisted' && 'text-muted-foreground line-through'],
              },
              () => s.email,
            ),
        )
      },
    },
    { id: 'name', accessorKey: 'name', header: () => t('globals.fields.name') },
    {
      id: 'status',
      accessorKey: 'status',
      header: () => t('globals.fields.status'),
      cell: ({ row }) => h(Badge, { variant: subscriberStatusVariant(row.original.status) }, () => t(`subscribers.status.${row.original.status}`)),
    },
    {
      id: 'lists',
      enableSorting: false,
      header: () => t('globals.terms.lists'),
      cell: ({ row }) => {
        const lists = row.original.lists ?? []
        const more = lists.length - LISTS
        return h('div', { class: 'flex max-w-72 flex-wrap gap-1' }, [
          ...lists.slice(0, LISTS).map((l) => {
            const unsubscribed = l.subscription_status === 'unsubscribed'
            const unconfirmed = l.optin === 'double' && l.subscription_status === 'unconfirmed'
            return h(
              RouterLink,
              {
                key: l.id,
                to: { name: 'subscribers-list', params: { listID: l.id } },
                title: unsubscribed || unconfirmed ? t(`subscribers.status.${l.subscription_status}`) : undefined,
              },
              () =>
                h(Badge, { variant: unsubscribed ? 'outline' : 'secondary', class: ['font-normal', unsubscribed && 'line-through'] }, () => [
                  l.name,
                  unconfirmed ? h('span', { 'class': 'size-1.5 rounded-full bg-warning', 'aria-label': t('subscribers.status.unconfirmed') }) : null,
                ]),
            )
          }),
          more > 0
            ? h('span', { class: 'self-center text-xs text-muted-foreground', title: lists.slice(LISTS).map((l) => l.name).join(', ') }, `+${more}`)
            : null,
        ])
      },
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: () => t('globals.fields.createdAt'),
      cell: ({ row }) => h('span', { class: 'whitespace-nowrap' }, date(row.original.created_at)),
    },
    {
      id: 'updated_at',
      accessorKey: 'updated_at',
      header: () => t('globals.fields.updatedAt'),
      cell: ({ row }) => h('span', { class: 'whitespace-nowrap' }, date(row.original.updated_at)),
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
            onEdit: () => onEdit(row.original),
            onDelete: () => onDelete(row.original),
          }),
        ),
    },
  ]
}
