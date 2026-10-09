<script setup lang="ts">
import { List, Mail, Plus, Rocket, Upload, Users } from '@lucide/vue'
import { format } from 'date-fns'
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue'
import Page from '@/components/layout/Page.vue'
import SlowQueriesNote from '@/components/SlowQueriesNote.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardCharts, useDashboardCounts } from '@/composables/queries/useDashboard'
import { usePermission } from '@/composables/usePermission'

const { t, n } = useI18n()
const { can } = usePermission()
const { data: counts, isPending: countsPending } = useDashboardCounts()
const { data: charts, isPending: chartsPending } = useDashboardCharts()

interface Tile {
  key: string
  icon: Component
  label: string
  total?: number
  /** Breakdown rows shown next to the total. */
  rows: { label: string; value?: number | null }[]
  /** The page the tile opens, when the user may see it. */
  to?: string
}

// Each tile is its own loading unit: only the numbers skeleton, never the page.
const tiles = computed<Tile[]>(() => {
  const c = counts.value
  return [
    {
      key: 'lists',
      icon: List,
      label: t('globals.terms.list', c?.lists?.total ?? 0),
      total: c?.lists?.total,
      to: 'lists',
      rows: [
        { label: t('lists.types.public'), value: c?.lists?.public },
        { label: t('lists.types.private'), value: c?.lists?.private },
        { label: t('lists.optins.single'), value: c?.lists?.optin_single },
        { label: t('lists.optins.double'), value: c?.lists?.optin_double },
      ],
    },
    {
      key: 'campaigns',
      icon: Rocket,
      label: t('globals.terms.campaign', c?.campaigns?.total ?? 0),
      total: c?.campaigns?.total,
      to: can('campaigns:get_all', 'campaigns:get') ? 'campaigns' : undefined,
      rows: Object.entries(c?.campaigns?.by_status ?? {}).map(([status, value]) => ({
        label: t(`campaigns.status.${status}`),
        value,
      })),
    },
    {
      key: 'subscribers',
      icon: Users,
      label: t('globals.terms.subscriber', c?.subscribers?.total ?? 0),
      total: c?.subscribers?.total,
      to: can('subscribers:get_all', 'subscribers:get') ? 'subscribers' : undefined,
      rows: [
        { label: t('subscribers.status.blocklisted'), value: c?.subscribers?.blocklisted ?? 0 },
        { label: t('dashboard.orphanSubs'), value: c?.subscribers?.orphans },
      ],
    },
    {
      key: 'messages',
      icon: Mail,
      label: t('dashboard.messagesSent'),
      total: c?.messages ?? 0,
      rows: [],
    },
  ]
})

const chartCards = computed(() => [
  { key: 'views', title: t('dashboard.campaignViews'), data: charts.value?.campaign_views ?? [] },
  { key: 'clicks', title: t('dashboard.linkClicks'), data: charts.value?.link_clicks ?? [] },
])
</script>

<template>
  <Page :title="t('menu.dashboard')" :description="format(new Date(), 'PPPP')">
    <template #actions>
      <Button v-if="can('subscribers:import')" variant="outline" size="sm" as-child>
        <RouterLink :to="{ name: 'import' }"><Upload />{{ t('menu.import') }}</RouterLink>
      </Button>
      <Button v-if="can('campaigns:manage')" size="sm" as-child>
        <RouterLink :to="{ name: 'campaign-new' }"><Plus />{{ t('campaigns.newCampaign') }}</RouterLink>
      </Button>
    </template>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <component
        :is="tile.to ? RouterLink : 'div'"
        v-for="tile in tiles"
        :key="tile.key"
        :to="tile.to ? { name: tile.to } : undefined"
        class="group/tile rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Card :data-cy="tile.key" class="h-full transition-colors group-hover/tile:border-foreground/20">
          <CardHeader>
            <CardDescription class="flex items-center gap-2">
              <component :is="tile.icon" class="size-4" />
              {{ tile.label }}
            </CardDescription>
            <CardTitle class="text-3xl font-bold tabular-nums">
              <Skeleton v-if="countsPending" class="h-9 w-24" />
              <template v-else>{{ n(tile.total ?? 0) }}</template>
            </CardTitle>
          </CardHeader>
          <CardContent v-if="tile.rows.length || countsPending">
            <div v-if="countsPending" class="space-y-2">
              <Skeleton v-for="i in 3" :key="i" class="h-3 w-full max-w-32" />
            </div>
            <dl v-else class="space-y-1 text-sm text-muted-foreground">
              <div v-for="row in tile.rows" :key="row.label" class="flex justify-between gap-4">
                <dt>{{ row.label }}</dt>
                <dd class="tabular-nums text-foreground">{{ n(row.value ?? 0) }}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </component>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <Card v-for="c in chartCards" :key="c.key" :data-cy="`chart-${c.key}`">
        <CardHeader>
          <CardTitle class="text-base">{{ c.title }}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton v-if="chartsPending" class="h-56 w-full" />
          <p v-else-if="!c.data.length" class="flex h-56 items-center justify-center text-sm text-muted-foreground">
            {{ t('web.dashboard.noData') }}
          </p>
          <TimeSeriesChart v-else :data="c.data" :label="c.title" />
        </CardContent>
      </Card>
    </div>

    <SlowQueriesNote />
  </Page>
</template>
