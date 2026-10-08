<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AnalyticsCount } from '@/api/types'
import DonutChart from '@/components/charts/DonutChart.vue'
import MultiSeriesChart from '@/components/charts/MultiSeriesChart.vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** One metric (views, clicks, bounces) for the selected campaigns: lines over time plus the split. */
const props = defineProps<{
  title: string
  campaigns: { id: number; name: string }[]
  data?: AnalyticsCount[]
  loading?: boolean
}>()
const { t, n } = useI18n()

const series = computed(() =>
  props.campaigns.map((c) => ({
    label: `#${c.id}: ${c.name}`,
    points: (props.data ?? []).filter((d) => d.campaign_id === c.id).map((d) => ({ at: d.timestamp!, count: d.count ?? 0 })),
  })),
)
const slices = computed(() => series.value.map((s) => ({ label: s.label, value: s.points.reduce((a, p) => a + p.count, 0) })))
const total = computed(() => slices.value.reduce((a, s) => a + s.value, 0))
</script>

<template>
  <Card :data-cy="`metric-${title}`">
    <CardHeader>
      <CardTitle>
        {{ title }}
        <span v-if="!loading" class="font-normal text-muted-foreground tabular-nums">({{ n(total) }})</span>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="grid gap-6 md:grid-cols-[1fr_10rem]"><Skeleton class="h-60" /><Skeleton class="size-32" /></div>
      <p v-else-if="!total" class="py-10 text-center text-sm text-muted-foreground">{{ t('web.dashboard.noData') }}</p>
      <div v-else class="grid items-center gap-6 md:grid-cols-[1fr_10rem]">
        <MultiSeriesChart :series="series" />
        <div class="space-y-3">
          <DonutChart :slices="slices" />
          <ul class="space-y-1 text-xs">
            <li v-for="(s, i) in slices" :key="s.label" class="flex items-center gap-2">
              <span class="size-2 shrink-0 rounded-full" :style="{ background: `var(--chart-${(i % 5) + 1})` }" />
              <span class="truncate" :title="s.label">{{ s.label }}</span>
              <span class="ml-auto tabular-nums">{{ n(s.value) }}</span>
            </li>
          </ul>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
