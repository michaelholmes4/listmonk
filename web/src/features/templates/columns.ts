import type { ColumnDef } from '@tanstack/vue-table'
import { format } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { Template } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import RowActions from './RowActions.vue'

type T = (key: string, ...args: unknown[]) => string

interface Handlers {
  t: T
  onPreview: (tpl: Template) => void
  onClone: (tpl: Template) => void
  onMakeDefault: (tpl: Template) => void
  onDelete: (tpl: Template) => void
  onEdit: (tpl: Template) => void
}

export const typeLabelKey = (type?: string) =>
  type === 'campaign' ? 'templates.typeCampaignHTML' : type === 'campaign_visual' ? 'templates.typeCampaignVisual' : 'templates.typeTransactional'

const date = (iso?: string) => (iso ? format(new Date(iso), 'PP') : '')

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns(c: Handlers): ColumnDef<any, Template>[] {
  const { t } = c
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: () => t('globals.fields.name'),
      cell: ({ row }) => {
        const tpl = row.original
        return h('div', { class: 'space-y-0.5' }, [
          h('div', { class: 'flex items-center gap-2' }, [
            h(RouterLink, { to: { name: 'template', params: { id: tpl.id } }, class: 'font-medium hover:underline' }, () => tpl.name),
            tpl.is_default ? h(Badge, { variant: 'secondary' }, () => t('templates.default')) : null,
          ]),
          tpl.type === 'tx' && tpl.subject ? h('p', { class: 'text-xs text-muted-foreground' }, tpl.subject) : null,
        ])
      },
    },
    {
      id: 'type',
      accessorKey: 'type',
      header: () => t('globals.fields.type'),
      cell: ({ row }) => h(Badge, { variant: 'outline' }, () => t(typeLabelKey(row.original.type))),
    },
    { id: 'id', accessorKey: 'id', header: () => t('globals.fields.id') },
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
      cell: ({ row }) => {
        const tpl = row.original
        return h(
          'div',
          { class: 'flex justify-end' },
          h(RowActions, {
            type: tpl.type ?? '',
            isDefault: !!tpl.is_default,
            onPreview: () => c.onPreview(tpl),
            onEdit: () => c.onEdit(tpl),
            onClone: () => c.onClone(tpl),
            onMakeDefault: () => c.onMakeDefault(tpl),
            onDelete: () => c.onDelete(tpl),
          }),
        )
      },
    },
  ]
}
