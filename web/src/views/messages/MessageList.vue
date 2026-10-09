<script setup lang="ts">
import { Send, X } from '@lucide/vue'
import { subDays } from 'date-fns'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MessageLogQuery, MessageSource, MessageStatus } from '@/api/message-log'
import type { MessageLogRow } from '@/api/types'
import DataTable from '@/components/datatable/DataTable.vue'
import DataTableToolbar from '@/components/datatable/DataTableToolbar.vue'
import FilterSelect from '@/components/datatable/FilterSelect.vue'
import SearchInput from '@/components/datatable/SearchInput.vue'
import EmptyState from '@/components/EmptyState.vue'
import Page from '@/components/layout/Page.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMessageLog } from '@/composables/queries/useMessageLog'
import { useUrlTable } from '@/composables/useTableState'
import { useUrlState } from '@/composables/useUrlState'
import { createColumns } from '@/features/messages/columns'

const { t } = useI18n()

// --- URL state: search, filters, page. -----------------------------------------------------------
const url = useUrlState(['messages'])
const search = url.str('q')
const statuses: MessageStatus[] = ['sent', 'failed', 'bounced']
const sources: MessageSource[] = ['campaign', 'automation', 'tx', 'notification', 'system']
const periods = { day: 1, week: 7, month: 30 } as const
type Period = keyof typeof periods

const status = computed({
  get: () => statuses.find((s) => s === url.query.value.status),
  set: (v) => url.set({ status: v, page: undefined }),
})
const source = computed({
  get: () => sources.find((s) => s === url.query.value.source),
  set: (v) => url.set({ source: v, page: undefined }),
})
const period = computed({
  get: () => (Object.keys(periods) as Period[]).find((p) => p === url.query.value.period),
  set: (v) => url.set({ period: v, page: undefined }),
})
// Set by links from a campaign, an automation or a subscriber; shown as removable chips.
const ids = computed(() => ({
  campaignId: Number(url.query.value.campaign_id) || undefined,
  automationId: Number(url.query.value.automation_id) || undefined,
  subscriberId: Number(url.query.value.subscriber_id) || undefined,
}))
const chips = computed(
  () =>
    [
      { key: 'campaign_id', label: t('web.messages.forCampaign'), id: ids.value.campaignId },
      { key: 'automation_id', label: t('web.messages.forAutomation'), id: ids.value.automationId },
      { key: 'subscriber_id', label: t('web.messages.forSubscriber'), id: ids.value.subscriberId },
    ].filter((c) => c.id),
)

const statusOptions = computed(() => statuses.map((s) => ({ value: s, label: t(`web.messages.status.${s}`) })))
const sourceOptions = computed(() => sources.map((s) => ({ value: s, label: t(`web.messages.sources.${s}`) })))
const periodOptions = computed(() => Object.keys(periods).map((p) => ({ value: p, label: t(`web.messages.periods.${p}`) })))

const { pagination, apiPage } = useUrlTable(url)
const filtered = computed(() => !!(search.value || status.value || source.value || period.value || chips.value.length))
const clearFilters = () =>
  url.set({ q: undefined, status: undefined, source: undefined, period: undefined, campaign_id: undefined, automation_id: undefined, subscriber_id: undefined, page: undefined })

const query = computed<MessageLogQuery>(() => ({
  query: search.value,
  status: status.value,
  source: source.value,
  ...ids.value,
  // The cut-off is rounded to the minute so the query (and its cache entry) stays put between renders.
  since: period.value ? new Date(Math.floor(subDays(new Date(), periods[period.value]).getTime() / 60000) * 60000).toISOString() : undefined,
  ...apiPage('desc'),
}))

const { data, isPending } = useMessageLog(query)
const total = computed(() => data.value?.total ?? 0)
const columns = createColumns({ t })
</script>

<template>
  <Page :title="t('web.messages.title')" :count="data ? total : undefined" :description="t('web.messages.description')">
    <DataTableToolbar>
      <SearchInput v-model="search" :placeholder="t('web.messages.search')" />
      <FilterSelect v-model="status" :label="t('globals.fields.status')" :options="statusOptions" />
      <FilterSelect v-model="source" :label="t('web.messages.type')" :options="sourceOptions" />
      <FilterSelect v-model="period" :label="t('web.messages.period')" :options="periodOptions" :all-label="t('web.common.all')" />
      <Badge v-for="c in chips" :key="c.key" variant="secondary" class="h-7 gap-1 pr-1" :data-cy="`filter-${c.key}`">
        {{ c.label }} #{{ c.id }}
        <button type="button" class="rounded-full p-0.5 hover:bg-foreground/10" :aria-label="t('globals.buttons.clear')" @click="url.set({ [c.key]: undefined, page: undefined })">
          <X class="size-3" />
        </button>
      </Badge>
    </DataTableToolbar>

    <DataTable
      v-model:pagination="pagination"
      :columns="columns"
      :data="data?.results ?? []"
      :row-count="total"
      :loading="isPending"
      :row-id="(m: MessageLogRow) => String(m.id)"
    >
      <template #empty>
        <EmptyState v-if="filtered" :title="t('web.common.noResults')" :description="t('web.common.noResultsHelp')">
          <template #action><Button variant="outline" size="sm" @click="clearFilters">{{ t('web.common.clearFilters') }}</Button></template>
        </EmptyState>
        <EmptyState v-else :icon="Send" :title="t('web.messages.emptyTitle')" :description="t('web.messages.emptyHelp')" />
      </template>
    </DataTable>
  </Page>
</template>
