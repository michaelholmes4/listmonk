import type { ColumnDef } from '@tanstack/vue-table'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { Campaign, CampaignStats } from '@/api/types'
import { selectColumn } from '@/components/datatable/selectColumn'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { duration } from '@/lib/dates'
import RowActions from './RowActions.vue'
import { isDone, isScheduled } from './status'

type T = (key: string, ...args: unknown[]) => string

interface Handlers {
  t: T
  n: (v: number) => string
  /** Live progress for running campaigns, by id. */
  stats: () => Map<number, CampaignStats>
  onEdit: (c: Campaign) => void
  onPreview: (c: Campaign) => void
  onClone: (c: Campaign) => void
  onDelete: (c: Campaign) => void
  /** Any status change; the view asks for confirmation. */
  onStatus: (c: Campaign, status: 'running' | 'paused' | 'scheduled' | 'cancelled') => void
}

const stamp = (iso?: string | null) => (iso ? format(new Date(iso), 'PP p') : '')
const day = (iso?: string | null) => (iso ? format(new Date(iso), 'PP') : '')

export const statusVariant = (s?: string) =>
  s === 'running' ? 'success' : s === 'paused' || s === 'scheduled' ? 'warning' : s === 'cancelled' ? 'destructive' : s === 'finished' ? 'secondary' : 'outline'

/** A right-aligned number column. */
const num = (cls = '') => ({ class: `block text-right tabular-nums ${cls}` })

/**
 * One line per campaign where possible (web/UX.md, "tables are scannable"): name with its subject
 * underneath, status, audience, then the numbers in their own right-aligned columns. The status
 * change (start, pause...) is the first entry of the row menu, not a button on every row.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns(c: Handlers): ColumnDef<any, Campaign>[] {
  const { t, n } = c
  /** Live numbers when this campaign is running, else the row's own. */
  const live = (row: Campaign) => c.stats().get(row.id!)
  const lists = 2

  return [
    selectColumn<Campaign>(t('web.common.selectAll'), (r) => r.name ?? ''),
    {
      id: 'name',
      accessorKey: 'name',
      header: () => t('globals.fields.name'),
      cell: ({ row }) => {
        const r = row.original
        return h('div', { class: 'min-w-48 max-w-md space-y-0.5' }, [
          h('div', { class: 'flex items-center gap-2' }, [
            h(RouterLink, { to: { name: 'campaign', params: { id: r.id } }, class: 'truncate font-medium hover:underline' }, () => r.name),
            r.type === 'optin' ? h(Badge, { variant: 'outline' }, () => t('lists.optin')) : null,
            ...(r.tags ?? []).map((tag) => h(Badge, { key: tag, variant: 'secondary', class: 'font-normal' }, () => tag)),
          ]),
          h('p', { class: 'truncate text-xs text-muted-foreground', title: r.subject }, r.subject),
        ])
      },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: () => t('globals.fields.status'),
      cell: ({ row }) => {
        const r = row.original
        const upcoming = isScheduled(r) && r.send_at && !isDone(r) && r.status !== 'running'
        return h('div', { class: 'space-y-0.5' }, [
          h(Badge, { variant: statusVariant(r.status) }, () => t(`campaigns.status.${r.status}`)),
          upcoming
            ? h('p', { class: 'text-xs whitespace-nowrap text-muted-foreground', title: stamp(r.send_at) }, formatDistanceToNowStrict(new Date(r.send_at!), { addSuffix: true }))
            : null,
        ])
      },
    },
    {
      id: 'lists',
      enableSorting: false,
      header: () => t('globals.terms.lists'),
      cell: ({ row }) => {
        const all = row.original.lists ?? []
        const more = all.length - lists
        return h('div', { class: 'max-w-56 text-sm' }, [
          ...all.slice(0, lists).flatMap((l, i) => [
            i ? ', ' : null,
            h(RouterLink, { key: l.id, to: { name: 'subscribers-list', params: { listID: l.id } }, class: 'hover:underline' }, () => l.name),
          ]),
          more > 0 ? h('span', { class: 'text-muted-foreground', title: all.slice(lists).map((l) => l.name).join(', ') }, ` +${more}`) : null,
        ])
      },
    },
    {
      id: 'sent',
      enableSorting: false,
      header: () => h('span', num(), t('campaigns.sent')),
      cell: ({ row }) => {
        const r = row.original
        const s = live(r)
        const sent = s?.sent ?? r.sent ?? 0
        const toSend = s?.to_send ?? r.to_send ?? 0
        return h('div', { class: 'min-w-24 space-y-1' }, [
          h('span', num('whitespace-nowrap'), toSend ? `${n(sent)} / ${n(toSend)}` : n(sent)),
          s && toSend
            ? h(Progress, { 'modelValue': Math.min(100, (sent / toSend) * 100), 'class': 'h-1', 'aria-label': t('campaigns.progress') })
            : null,
          s?.rate ? h('span', num('text-xs text-muted-foreground'), `${s.rate} / ${t('campaigns.rateMinuteShort')}`) : null,
        ])
      },
    },
    {
      id: 'views',
      enableSorting: false,
      header: () => h('span', num(), t('campaigns.views')),
      cell: ({ row }) => h('span', num(), n(row.original.views ?? 0)),
    },
    {
      id: 'clicks',
      enableSorting: false,
      header: () => h('span', num(), t('campaigns.clicks')),
      cell: ({ row }) => h('span', num(), n(row.original.clicks ?? 0)),
    },
    {
      id: 'bounces',
      enableSorting: false,
      header: () => h('span', num(), t('globals.terms.bounces')),
      cell: ({ row }) => {
        const r = row.original
        return r.bounces
          ? h(RouterLink, { to: { name: 'bounces', query: { campaign_id: r.id } }, ...num('hover:underline') }, () => n(r.bounces ?? 0))
          : h('span', num('text-muted-foreground'), '0')
      },
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: () => t('globals.fields.createdAt'),
      cell: ({ row }) => {
        const r = row.original
        const s = live(r)
        const started = s?.started_at ?? r.started_at
        const updated = s?.updated_at ?? r.updated_at
        // The full timeline is one hover away; the cell keeps to the date.
        const title = [
          `${t('globals.fields.createdAt')}: ${stamp(r.created_at)}`,
          started ? `${t('campaigns.startedAt')}: ${stamp(started)}` : '',
          isDone(r) && updated ? `${t('campaigns.ended')}: ${stamp(updated)}` : '',
          started && updated ? `⏱ ${duration(started, updated)}` : '',
        ]
          .filter(Boolean)
          .join('\n')
        return h('span', { class: 'whitespace-nowrap text-sm', title }, day(r.created_at))
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => '',
      cell: ({ row }) => {
        const r = row.original
        return h(
          'div',
          { class: 'flex justify-end' },
          h(RowActions, {
            campaign: r,
            onEdit: () => c.onEdit(r),
            onPreview: () => c.onPreview(r),
            onClone: () => c.onClone(r),
            onStart: () => c.onStatus(r, 'running'),
            onSchedule: () => c.onStatus(r, 'scheduled'),
            onPause: () => c.onStatus(r, 'paused'),
            onResume: () => c.onStatus(r, 'running'),
            onCancel: () => c.onStatus(r, 'cancelled'),
            onDelete: () => c.onDelete(r),
          }),
        )
      },
    },
  ]
}
