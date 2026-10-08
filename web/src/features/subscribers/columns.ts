import type { ColumnDef } from '@tanstack/vue-table'
import { format } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { Subscriber } from '@/api/types'
import CopyText from '@/components/CopyText.vue'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import RowActions from './RowActions.vue'

type T = (key: string, ...args: unknown[]) => string

interface Handlers {
  t: T
  onEdit: (s: Subscriber) => void
  onDelete: (s: Subscriber) => void
}

const date = (iso?: string) => (iso ? format(new Date(iso), 'PP') : '')

/** Lists the subscriber is still on (an unsubscribed list doesn't count). */
export const activeListCount = (s: Subscriber) =>
  (s.lists ?? []).filter((l) => l.subscription_status !== 'unsubscribed').length

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns({ t, onEdit, onDelete }: Handlers): ColumnDef<any, Subscriber>[] {
  return [
    {
      id: 'select',
      enableSorting: false,
      header: ({ table }) =>
        h(Checkbox, {
          'modelValue': table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false,
          'onUpdate:modelValue': (v: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(v === true),
          'aria-label': t('subscribers.selectAll', { num: '' }),
        }),
      cell: ({ row }) =>
        h(Checkbox, {
          'modelValue': row.getIsSelected(),
          'onUpdate:modelValue': (v: boolean | 'indeterminate') => row.toggleSelected(v === true),
          'aria-label': row.original.email,
        }),
    },
    {
      id: 'email',
      accessorKey: 'email',
      header: () => t('subscribers.email'),
      cell: ({ row }) => {
        const s = row.original
        const blocked = s.status === 'blocklisted'
        return h('div', { class: 'space-y-1' }, [
          h('div', { class: 'flex items-center gap-2' }, [
            h(
              'button',
              {
                type: 'button',
                class: ['font-medium hover:underline', blocked && 'text-destructive line-through'],
                onClick: () => onEdit(s),
              },
              s.email,
            ),
            h(CopyText, { text: s.email ?? '' }, { default: () => [] }),
            s.status !== 'enabled'
              ? h(Badge, { variant: blocked ? 'destructive' : 'warning' }, () => t(`subscribers.status.${s.status}`))
              : null,
          ]),
          (s.lists ?? []).length
            ? h(
                'div',
                { class: 'flex flex-wrap gap-1' },
                (s.lists ?? []).map((l) => {
                  const flagged = l.optin === 'double' || l.subscription_status === 'unsubscribed'
                  return h(
                    RouterLink,
                    { key: l.id, to: { name: 'subscribers-list', params: { listID: l.id } } },
                    () =>
                      h(
                        Badge,
                        { variant: l.subscription_status === 'unsubscribed' ? 'warning' : 'secondary' },
                        () => [l.name, flagged ? h('sup', t(`subscribers.status.${l.subscription_status}`)) : null],
                      ),
                  )
                }),
              )
            : null,
        ])
      },
    },
    { id: 'name', accessorKey: 'name', header: () => t('globals.fields.name') },
    {
      id: 'lists',
      enableSorting: false,
      header: () => t('globals.terms.lists'),
      cell: ({ row }) => h('span', { class: 'tabular-nums' }, activeListCount(row.original)),
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
            onEdit: () => onEdit(row.original),
            onDelete: () => onDelete(row.original),
          }),
        ),
    },
  ]
}
