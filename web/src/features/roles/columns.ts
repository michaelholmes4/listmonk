import type { ColumnDef } from '@tanstack/vue-table'
import { format } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import RowActions from './RowActions.vue'
import { SUPER_ADMIN_ROLE_ID } from './schema'

type T = (key: string, ...args: unknown[]) => string
export interface RoleRow {
  id?: number
  name?: string | null
  created_at?: string | null
  updated_at?: string | null
}

interface Handlers<R extends RoleRow> {
  t: T
  /** Route name of the edit page for this kind of role. */
  route: string
  onEdit: (r: R) => void
  onClone: (r: R) => void
  onDelete: (r: R) => void
}

const date = (iso?: string | null) => (iso ? format(new Date(iso), 'PP') : '')

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns<R extends RoleRow>(c: Handlers<R>): ColumnDef<any, R>[] {
  const { t } = c
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: () => t('users.role', 1),
      cell: ({ row }) => {
        const r = row.original
        return h(RouterLink, { to: { name: c.route, params: { id: r.id } }, class: 'inline-flex items-center gap-2 font-medium hover:underline' }, () => [
          r.name,
          r.id === SUPER_ADMIN_ROLE_ID ? h(Badge, { variant: 'default' }, () => t('users.type.super')) : null,
        ])
      },
    },
    { id: 'created_at', accessorKey: 'created_at', header: () => t('globals.fields.createdAt'), cell: ({ row }) => date(row.original.created_at) },
    { id: 'updated_at', accessorKey: 'updated_at', header: () => t('globals.fields.updatedAt'), cell: ({ row }) => date(row.original.updated_at) },
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
            onClone: () => c.onClone(row.original),
            onDelete: () => c.onDelete(row.original),
          }),
        ),
    },
  ]
}
