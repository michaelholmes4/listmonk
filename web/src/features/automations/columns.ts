import type { ColumnDef } from '@tanstack/vue-table'
import { format } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { AutomationRow } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import RowActions from './RowActions.vue'
import { automationVariant } from './status'

type T = (key: string, ...args: unknown[]) => string
type N = (n: number) => string

interface Handlers {
  t: T
  n: N
  onEdit: (a: AutomationRow) => void
  onPause: (a: AutomationRow) => void
  onResume: (a: AutomationRow) => void
  onArchive: (a: AutomationRow) => void
  onDelete: (a: AutomationRow) => void
}

const stamp = (iso?: string | null) => (iso ? format(new Date(iso), 'PP p') : '')

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns(c: Handlers): ColumnDef<any, AutomationRow>[] {
  const { t, n } = c
  const count = (id: 'active' | 'completed' | 'failed', key: string) => ({
    id,
    header: () => h('span', { class: 'block text-right' }, t(key)),
    enableSorting: false,
    cell: ({ row }: { row: { original: AutomationRow } }) => {
      const v = (row.original[id] ?? 0) + (id === 'active' ? (row.original.waiting ?? 0) : 0)
      return h('span', { class: ['block text-right tabular-nums', v === 0 && 'text-muted-foreground'] }, n(v))
    },
  })
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: () => t('globals.fields.name'),
      cell: ({ row }) =>
        h(RouterLink, { to: { name: 'automation', params: { id: row.original.id } }, class: 'font-medium hover:underline' }, () => row.original.name),
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: () => t('globals.fields.status'),
      cell: ({ row }) => h(Badge, { variant: automationVariant(row.original.status) }, () => t(`web.automations.status.${row.original.status}`)),
    },
    count('active', 'web.automations.inProgress'),
    count('completed', 'web.automations.completed'),
    count('failed', 'web.automations.failed'),
    {
      id: 'updated_at',
      accessorKey: 'updated_at',
      header: () => t('globals.fields.updatedAt'),
      cell: ({ row }) => stamp(row.original.updated_at),
    },
    {
      id: 'actions',
      header: () => '',
      enableSorting: false,
      cell: ({ row }) =>
        h(RowActions, {
          status: row.original.status ?? 'draft',
          onEdit: () => c.onEdit(row.original),
          onPause: () => c.onPause(row.original),
          onResume: () => c.onResume(row.original),
          onArchive: () => c.onArchive(row.original),
          onDelete: () => c.onDelete(row.original),
        }),
    },
  ]
}
