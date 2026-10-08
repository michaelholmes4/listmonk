<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardCounts } from '@/composables/queries/useDashboard'

const { t, n } = useI18n()
const { data: counts, isPending } = useDashboardCounts()

// Each tile loads on its own: the skeleton replaces just the number, never the page.
const tiles = computed(() => [
  { key: 'subscribers', label: t('globals.terms.subscribers'), value: counts.value?.subscribers?.total },
  { key: 'lists', label: t('globals.terms.lists'), value: counts.value?.lists?.total },
  { key: 'campaigns', label: t('globals.terms.campaigns'), value: counts.value?.campaigns?.total },
  { key: 'messages', label: t('web.dashboard.messages'), value: counts.value?.messages },
])
</script>

<template>
  <div class="space-y-6 p-6">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card v-for="tile in tiles" :key="tile.key">
        <CardHeader>
          <CardDescription>{{ tile.label }}</CardDescription>
          <CardTitle class="text-3xl font-bold tabular-nums">
            <Skeleton v-if="isPending" class="h-9 w-24" />
            <template v-else>{{ n(tile.value ?? 0) }}</template>
          </CardTitle>
        </CardHeader>
        <CardContent class="text-xs text-muted-foreground">{{ t('web.dashboard.updated') }}</CardContent>
      </Card>
    </div>
  </div>
</template>
