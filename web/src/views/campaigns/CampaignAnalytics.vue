<script setup lang="ts">
import { useQueries } from '@tanstack/vue-query'
import { Info, Search } from '@lucide/vue'
import { addDays, endOfDay, startOfDay } from 'date-fns'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { getCampaign } from '@/api/campaigns'
import type { AnalyticsRange } from '@/api/campaigns'
import Page from '@/components/layout/Page.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { keys } from '@/composables/queries/keys'
import { useCampaignAnalytics, useCampaignLinks } from '@/composables/queries/useCampaigns'
import { useConfig } from '@/composables/queries/useConfig'
import CampaignPicker, { type PickedCampaign } from '@/features/campaigns/CampaignPicker.vue'
import { fromLocalInput, toLocalInput } from '@/features/campaigns/schema'
import LinksCard from '@/features/analytics/LinksCard.vue'
import MetricCard from '@/features/analytics/MetricCard.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { data: config } = useConfig()

// --- The query lives in the URL: ?id=1&id=2&from=<unix>&to=<unix>, like the classic page. ----------
const ids = computed(() =>
  [route.query.id ?? []].flat().map(Number).filter((n) => Number.isInteger(n) && n > 0),
)
const unix = (v: unknown, fallback: Date) => (Number(v) > 0 ? new Date(Number(v) * 1000) : fallback)
const range = computed<AnalyticsRange | undefined>(() => {
  if (!ids.value.length) return undefined
  const now = endOfDay(new Date())
  return { ids: ids.value, from: unix(route.query.from, startOfDay(addDays(now, -7))), to: unix(route.query.to, now) }
})

// --- The form edits a copy; "search" writes it back to the URL. -------------------------------------
const picked = ref<PickedCampaign[]>([])
const from = ref('')
const to = ref('')
watch(
  range,
  (r) => {
    const f = r?.from ?? startOfDay(addDays(new Date(), -7))
    const e = r?.to ?? endOfDay(new Date())
    from.value = toLocalInput(f.toISOString())
    to.value = toLocalInput(e.toISOString())
  },
  { immediate: true },
)

// Names for the ids in the URL (a link from the campaigns list only carries ids).
const named = useQueries({
  queries: computed(() => ids.value.map((id) => ({ queryKey: keys.campaigns.detail(id), queryFn: () => getCampaign(id), staleTime: 60_000 }))),
})
watch(
  () => named.value.map((q) => q.data?.name),
  () => {
    picked.value = ids.value.map((id, i) => ({ id, name: named.value[i]?.data?.name ?? '…' }))
  },
  { immediate: true },
)

// Keep the range sane: the end can't precede the start (the other end moves a week).
function onFrom(v: string | number) {
  from.value = String(v)
  if (from.value && to.value && from.value > to.value) to.value = toLocalInput(addDays(new Date(from.value), 7).toISOString())
}
function onTo(v: string | number) {
  to.value = String(v)
  if (from.value && to.value && from.value > to.value) from.value = toLocalInput(addDays(new Date(to.value), -7).toISOString())
}

function apply() {
  router.push({
    query: {
      id: picked.value.map((c) => String(c.id)),
      from: String(Math.floor(new Date(fromLocalInput(from.value)!).getTime() / 1000)),
      to: String(Math.floor(new Date(fromLocalInput(to.value)!).getTime() / 1000)),
    },
  })
}

// --- One query per metric, so each card loads on its own. -------------------------------------------
const views = useCampaignAnalytics('views', range)
const clicks = useCampaignAnalytics('clicks', range)
const bounces = useCampaignAnalytics('bounces', range)
const links = useCampaignLinks(range)

const noteKey = computed(() =>
  config.value?.privacy?.disable_tracking ? 'analytics.trackingDisabled' : config.value?.privacy && !config.value.privacy.individual_tracking ? 'analytics.nonIndividualTracking' : '',
)
</script>

<template>
  <Page :title="t('analytics.title')">
    <Alert v-if="noteKey"><Info /><AlertDescription>{{ t(noteKey) }}</AlertDescription></Alert>

    <form class="grid items-end gap-4 md:grid-cols-[1fr_auto_auto_auto]" @submit.prevent="apply">
      <div class="space-y-2">
        <Label>{{ t('globals.terms.campaigns') }}</Label>
        <CampaignPicker v-model="picked" />
      </div>
      <div class="space-y-2">
        <Label for="from">{{ t('analytics.fromDate') }}</Label>
        <Input id="from" :model-value="from" type="datetime-local" data-cy="from" @update:model-value="onFrom" />
      </div>
      <div class="space-y-2">
        <Label for="to">{{ t('analytics.toDate') }}</Label>
        <Input id="to" :model-value="to" type="datetime-local" data-cy="to" @update:model-value="onTo" />
      </div>
      <Button type="submit" :disabled="!picked.length || !from || !to" data-cy="btn-search"><Search />{{ t('web.common.search') }}</Button>
    </form>

    <p v-if="!range" class="text-sm text-muted-foreground">{{ t('web.analytics.pick') }}</p>
    <template v-else>
      <MetricCard :title="t('campaigns.views')" :campaigns="picked" :data="views.data.value" :loading="views.isPending.value" />
      <MetricCard :title="t('campaigns.clicks')" :campaigns="picked" :data="clicks.data.value" :loading="clicks.isPending.value" />
      <MetricCard :title="t('globals.terms.bounces')" :campaigns="picked" :data="bounces.data.value" :loading="bounces.isPending.value" />
      <LinksCard :links="links.data.value" :loading="links.isPending.value" />
    </template>
  </Page>
</template>
