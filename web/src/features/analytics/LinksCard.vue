<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AnalyticsLink } from '@/api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Clicks per link as a ranked list with proportional bars (long URLs read better than as axis labels). */
const props = defineProps<{ links?: AnalyticsLink[]; loading?: boolean }>()
const { t, n } = useI18n()

const sorted = computed(() => [...(props.links ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)))
const max = computed(() => Math.max(1, ...sorted.value.map((l) => l.count ?? 0)))
const total = computed(() => sorted.value.reduce((a, l) => a + (l.count ?? 0), 0))

// Safe to show: only link out for http(s); anything else (mailto:, javascript:) stays text.
const href = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : undefined)
</script>

<template>
  <Card data-cy="metric-links">
    <CardHeader>
      <CardTitle>
        {{ t('analytics.links') }}
        <span v-if="!loading" class="font-normal text-muted-foreground tabular-nums">({{ n(total) }})</span>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="space-y-3"><Skeleton v-for="i in 4" :key="i" class="h-8" /></div>
      <p v-else-if="!sorted.length" class="py-10 text-center text-sm text-muted-foreground">{{ t('web.dashboard.noData') }}</p>
      <ul v-else class="space-y-3">
        <li v-for="l in sorted" :key="l.url" class="space-y-1">
          <div class="flex items-center justify-between gap-4 text-sm">
            <a v-if="href(l.url)" :href="href(l.url)" target="_blank" rel="noopener noreferrer" class="truncate text-primary hover:underline" :title="l.url">{{ l.url }}</a>
            <span v-else class="truncate" :title="l.url">{{ l.url }}</span>
            <span class="tabular-nums">{{ n(l.count ?? 0) }}</span>
          </div>
          <div class="h-1.5 rounded-full bg-muted"><div class="h-full rounded-full bg-chart-1" :style="{ width: `${((l.count ?? 0) / max) * 100}%` }" /></div>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
