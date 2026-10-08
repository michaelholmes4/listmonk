import type { ColumnDef } from '@tanstack/vue-table'
import { format } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { User } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import RowActions from './RowActions.vue'

type T = (key: string, ...args: unknown[]) => string

interface Handlers {
  t: T
  onEdit: (u: User) => void
  onDelete: (u: User) => void
}

const date = (iso?: string | null, withTime = false) => (iso ? format(new Date(iso), withTime ? 'PPp' : 'PP') : '')

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns(c: Handlers): ColumnDef<any, User>[] {
  const { t } = c
  return [
    {
      id: 'username',
      accessorKey: 'username',
      header: () => t('users.username'),
      cell: ({ row }) => {
        const u = row.original
        return h('div', { class: 'space-y-0.5' }, [
          h('div', { class: 'flex flex-wrap items-center gap-2' }, [
            h(
              RouterLink,
              { to: { name: 'user', params: { id: u.id } }, class: ['font-medium hover:underline', u.status === 'disabled' && 'text-muted-foreground'] },
              () => u.username,
            ),
            u.status === 'disabled' ? h(Badge, { variant: 'secondary' }, () => t('users.status.disabled')) : null,
            u.type === 'api' ? h(Badge, { variant: 'outline' }, () => t('users.type.api')) : null,
          ]),
          u.name && u.name !== u.username ? h('p', { class: 'text-xs text-muted-foreground' }, u.name) : null,
        ])
      },
    },
    {
      id: 'role',
      header: () => t('users.role', 2),
      cell: ({ row }) => {
        const u = row.original
        return h('div', { class: 'flex flex-wrap gap-1.5' }, [
          h(RouterLink, { to: { name: 'user-roles' } }, () => h(Badge, { variant: u.user_role?.id === 1 ? 'default' : 'secondary' }, () => u.user_role?.name)),
          u.list_role
            ? h(RouterLink, { to: { name: 'list-roles' } }, () => h(Badge, { variant: 'outline' }, () => u.list_role!.name))
            : null,
        ])
      },
    },
    {
      id: 'email',
      accessorKey: 'email',
      header: () => t('subscribers.email'),
      cell: ({ row }) => row.original.email || '—',
    },
    { id: 'created_at', accessorKey: 'created_at', header: () => t('globals.fields.createdAt'), cell: ({ row }) => date(row.original.created_at) },
    { id: 'updated_at', accessorKey: 'updated_at', header: () => t('globals.fields.updatedAt'), cell: ({ row }) => date(row.original.updated_at) },
    {
      id: 'last_login',
      accessorKey: 'loggedin_at',
      header: () => t('users.lastLogin'),
      cell: ({ row }) => date(row.original.loggedin_at, true) || '—',
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => '',
      cell: ({ row }) =>
        h(
          'div',
          { class: 'flex justify-end' },
          h(RowActions, { onEdit: () => c.onEdit(row.original), onDelete: () => c.onDelete(row.original) }),
        ),
    },
  ]
}
