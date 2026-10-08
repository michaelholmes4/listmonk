import type { ColumnDef } from '@tanstack/vue-table'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { h } from 'vue'
import { RouterLink } from 'vue-router'
import type { Campaign, CampaignStats } from '@/api/types'
import CopyText from '@/components/CopyText.vue'
import { selectColumn } from '@/components/datatable/selectColumn'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { duration } from '@/lib/dates'
import RowActions from './RowActions.vue'
import StatusAction from './StatusAction.vue'
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

export const statusVariant = (s?: string) =>
  s === 'running' ? 'success' : s === 'paused' || s === 'scheduled' ? 'warning' : s === 'cancelled' ? 'destructive' : s === 'finished' ? 'secondary' : 'outline'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function createColumns(c: Handlers): ColumnDef<any, Campaign>[] {
  const { t, n } = c
  /** Live numbers when this campaign is running, else the row's own. */
  const live = (row: Campaign) => c.stats().get(row.id!)

  return [
    selectColumn<Campaign>(t('web.common.selectAll'), (r) => r.name ?? ''),
    {
      id: 'status',
      accessorKey: 'status',
      header: () => t('globals.fields.status'),
      cell: ({ row }) => {
        const r = row.original
        return h('div', { class: 'space-y-1' }, [
          h(Badge, { variant: statusVariant(r.status) }, () => t(`campaigns.status.${r.status}`)),
          isScheduled(r) && r.send_at
            ? h('p', { class: 'text-xs text-muted-foreground' }, [
                !isDone(r) && r.status !== 'running' ? `${formatDistanceToNowStrict(new Date(r.send_at), { addSuffix: true })} · ` : '',
                stamp(r.send_at),
              ])
            : null,
        ])
      },
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: () => t('globals.fields.name'),
      cell: ({ row }) => {
        const r = row.original
        return h('div', { class: 'space-y-1' }, [
          h('div', { class: 'flex items-center gap-2' }, [
            r.type === 'optin' ? h(Badge, { variant: 'outline' }, () => t('lists.optin')) : null,
            h(RouterLink, { to: { name: 'campaign', params: { id: r.id } }, class: 'font-medium hover:underline' }, () => r.name),
          ]),
          h('p', { class: 'text-xs text-muted-foreground' }, h(CopyText, { text: r.subject ?? '' })),
          (r.tags ?? []).length
            ? h('div', { class: 'flex flex-wrap gap-1' }, (r.tags ?? []).map((tag) => h(Badge, { key: tag, variant: 'outline' }, () => tag)))
            : null,
        ])
      },
    },
    {
      id: 'lists',
      enableSorting: false,
      header: () => t('globals.terms.lists'),
      cell: ({ row }) =>
        h(
          'ul',
          { class: 'space-y-0.5 text-sm' },
          (row.original.lists ?? []).map((l) =>
            h('li', { key: l.id }, h(RouterLink, { to: { name: 'subscribers-list', params: { listID: l.id } }, class: 'hover:underline' }, () => l.name)),
          ),
        ),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: () => t('campaigns.timestamps'),
      cell: ({ row }) => {
        const r = row.original
        const s = live(r)
        const started = s?.started_at ?? r.started_at
        const updated = s?.updated_at ?? r.updated_at
        const line = (label: string, value: string) =>
          h('p', { class: 'flex gap-2' }, [h('span', { class: 'w-14 shrink-0 text-muted-foreground' }, label), h('span', value)])
        return h('div', { class: 'space-y-0.5 text-xs' }, [
          line(t('globals.fields.createdAt'), stamp(r.created_at)),
          started ? line(t('campaigns.startedAt'), stamp(started)) : null,
          isDone(r) && updated ? line(t('campaigns.ended'), stamp(updated)) : null,
          started && updated ? line('⏱', duration(started, updated)) : null,
        ])
      },
    },
    {
      id: 'stats',
      enableSorting: false,
      header: () => t('campaigns.stats'),
      cell: ({ row }) => {
        const r = row.original
        const s = live(r)
        const sent = s?.sent ?? r.sent ?? 0
        const toSend = s?.to_send ?? r.to_send ?? 0
        const line = (label: string, value: unknown) =>
          h('p', { class: 'flex gap-2' }, [h('span', { class: 'w-14 shrink-0 text-muted-foreground' }, label), h('span', { class: 'tabular-nums' }, value as string)])
        return h('div', { class: 'space-y-0.5 text-xs' }, [
          line(t('campaigns.views'), n(r.views ?? 0)),
          line(t('campaigns.clicks'), n(r.clicks ?? 0)),
          line(t('campaigns.sent'), `${n(sent)} / ${n(toSend)}`),
          h('p', { class: 'flex gap-2' }, [
            h('span', { class: 'w-14 shrink-0 text-muted-foreground' }, t('globals.terms.bounces')),
            h(RouterLink, { to: { name: 'bounces', query: { campaign_id: r.id } }, class: 'tabular-nums hover:underline' }, () => n(r.bounces ?? 0)),
          ]),
          s?.rate ? line('⚡', `${s.rate} / ${t('campaigns.rateMinuteShort')}`) : null,
          s && toSend ? h(Progress, { 'modelValue': Math.min(100, (sent / toSend) * 100), 'class': 'mt-1 h-1.5', 'aria-label': t('campaigns.progress') }) : null,
        ])
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => '',
      cell: ({ row }) => {
        const r = row.original
        return h('div', { class: 'flex items-center justify-end gap-1' }, [
          h(StatusAction, {
            campaign: r,
            onStart: () => c.onStatus(r, 'running'),
            onSchedule: () => c.onStatus(r, 'scheduled'),
            onPause: () => c.onStatus(r, 'paused'),
            onResume: () => c.onStatus(r, 'running'),
          }),
          h(RowActions, {
            campaign: r,
            onEdit: () => c.onEdit(r),
            onPreview: () => c.onPreview(r),
            onClone: () => c.onClone(r),
            onCancel: () => c.onStatus(r, 'cancelled'),
            onDelete: () => c.onDelete(r),
          }),
        ])
      },
    },
  ]
}
