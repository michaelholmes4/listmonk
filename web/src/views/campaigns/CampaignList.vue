<script setup lang="ts">
import { Plus, Rocket, Trash2 } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { CampaignQuery, CampaignStatus } from '@/api/campaigns'
import type { Campaign } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import DataTableToolbar from '@/components/datatable/DataTableToolbar.vue'
import FilterSelect from '@/components/datatable/FilterSelect.vue'
import SearchInput from '@/components/datatable/SearchInput.vue'
import EmptyState from '@/components/EmptyState.vue'
import Page from '@/components/layout/Page.vue'
import PreviewDialog from '@/components/PreviewDialog.vue'
import PromptDialog from '@/components/PromptDialog.vue'
import { Button } from '@/components/ui/button'
import {
  useBulkDeleteCampaigns,
  useCampaigns,
  useChangeCampaignStatus,
  useCloneCampaign,
  useDeleteCampaign,
  usePreviewCampaign,
  useRunningStats,
} from '@/composables/queries/useCampaigns'
import { usePermission } from '@/composables/usePermission'
import { useRowSelection, useUrlTable } from '@/composables/useTableState'
import { useUrlState } from '@/composables/useUrlState'
import { createColumns } from '@/features/campaigns/columns'

const { t, n } = useI18n()
const router = useRouter()
const { can } = usePermission()

// --- URL state: search, status, page and sort. ----------------------------------------------------
const url = useUrlState(['campaigns'])
const search = url.str('q')
const statuses: CampaignStatus[] = ['draft', 'scheduled', 'running', 'paused', 'finished', 'cancelled']
const status = computed({
  get: () => {
    const s = url.query.value.status as CampaignStatus | undefined
    return s && statuses.includes(s) ? s : undefined
  },
  set: (v) => url.set({ status: v }),
})
const statusOptions = computed(() => statuses.map((s) => ({ value: s, label: t(`campaigns.status.${s}`) })))
const { pagination, sorting, apiPage } = useUrlTable(url)

const filter = computed(() => ({ query: search.value, status: status.value }))
const filtered = computed(() => !!(search.value || status.value))
const clearFilters = () => url.set({ q: undefined, status: undefined })
// Default: newest first, like the classic screen.
const query = computed<CampaignQuery>(() => ({ ...filter.value, ...apiPage<NonNullable<CampaignQuery['orderBy']>>('desc') }))

const { data, isPending } = useCampaigns(query)
const total = computed(() => data.value?.total ?? 0)
const { data: running } = useRunningStats()
const stats = computed(() => new Map((running.value ?? []).map((s) => [s.id!, s])))

const sel = useRowSelection({
  total,
  pageRows: computed(() => data.value?.results.length ?? 0),
  filter,
  onFilterChange: () => url.set({ page: undefined }),
})

// --- Status changes (start, schedule, pause, resume, cancel), each confirmed. --------------------
type Change = { campaign: Campaign; status: 'running' | 'paused' | 'scheduled' | 'cancelled' }
const change = ref<Change | null>(null)
const changeOpen = computed({ get: () => !!change.value, set: (o) => !o && (change.value = null) })
const setStatus = useChangeCampaignStatus()
const changeLabel = computed(() => {
  const c = change.value
  if (!c) return ''
  return c.status === 'scheduled'
    ? t('campaigns.schedule')
    : c.status === 'paused'
      ? t('campaigns.pause')
      : c.status === 'cancelled'
        ? t('globals.buttons.cancel')
        : c.campaign.status === 'paused'
          ? t('campaigns.send')
          : t('campaigns.start')
})
function confirmChange() {
  const c = change.value!
  setStatus.mutate(
    { id: c.campaign.id!, status: c.status },
    {
      onSuccess: () => {
        toast.success(t('campaigns.statusChanged', { name: c.campaign.name, status: c.status }))
        change.value = null
      },
    },
  )
}

// --- Preview, clone, delete. ---------------------------------------------------------------------
const preview = usePreviewCampaign()
const previewing = ref<Campaign | null>(null)
const previewOpen = computed({ get: () => !!previewing.value, set: (o) => !o && (previewing.value = null) })

const cloning = ref<Campaign | null>(null)
const cloneOpen = computed({ get: () => !!cloning.value, set: (o) => !o && (cloning.value = null) })
const clone = useCloneCampaign()
function doClone(name: string) {
  clone.mutate(
    { source: cloning.value!, name },
    {
      onSuccess: (c) => {
        cloning.value = null
        router.push({ name: 'campaign', params: { id: c.id } })
      },
    },
  )
}

const toDelete = ref<Campaign | null>(null)
const deleteOpen = computed({ get: () => !!toDelete.value, set: (o) => !o && (toDelete.value = null) })
const remove = useDeleteCampaign()
function confirmDelete() {
  const c = toDelete.value!
  remove.mutate(c.id!, {
    onSuccess: () => {
      toast.success(t('globals.messages.deleted', { name: c.name }))
      toDelete.value = null
    },
  })
}

const bulkOpen = ref(false)
const bulkDelete = useBulkDeleteCampaigns()
function runBulkDelete() {
  bulkDelete.mutate(sel.selectAll ? { filter: filter.value } : { ids: sel.ids }, {
    onSuccess: (num) => {
      toast.success(t('globals.messages.deletedCount', { name: t('globals.terms.campaigns'), num }))
      bulkOpen.value = false
      sel.clear()
    },
  })
}

const columns = createColumns({
  t,
  n,
  stats: () => stats.value,
  onEdit: (c) => router.push({ name: 'campaign', params: { id: c.id } }),
  onPreview: (c) => {
    previewing.value = c
    preview.mutate(c.id!)
  },
  onClone: (c) => (cloning.value = c),
  onDelete: (c) => (toDelete.value = c),
  onStatus: (c, s) => (change.value = { campaign: c, status: s }),
})
</script>

<template>
  <Page :title="t('globals.terms.campaigns')" :count="data ? total : undefined">
    <template #actions>
      <Button v-if="can('campaigns:manage')" size="sm" data-cy="btn-new" @click="router.push({ name: 'campaign-new' })">
        <Plus />{{ t('campaigns.newCampaign') }}
      </Button>
    </template>

    <DataTableToolbar :selected="sel.count" :total="total" :can-select-all="sel.canSelectAll" @select-all="sel.selectAll = true" @clear="sel.clear">
      <SearchInput v-model="search" :placeholder="t('campaigns.queryPlaceholder')" />
      <FilterSelect v-model="status" :label="t('globals.fields.status')" :options="statusOptions" />
      <template v-if="can('campaigns:manage')" #bulk>
        <Button variant="ghost" size="sm" class="text-destructive" @click="bulkOpen = true"><Trash2 />{{ t('globals.buttons.delete') }}</Button>
      </template>
    </DataTableToolbar>

    <DataTable
      v-model:pagination="pagination"
      v-model:sorting="sorting"
      v-model:selection="sel.selection"
      :columns="columns"
      :data="data?.results ?? []"
      :row-count="total"
      :loading="isPending"
      :row-id="(c: Campaign) => String(c.id)"
    >
      <template #empty>
        <EmptyState v-if="filtered" :title="t('web.common.noResults')" :description="t('web.common.noResultsHelp')">
          <template #action><Button variant="outline" size="sm" @click="clearFilters">{{ t('web.common.clearFilters') }}</Button></template>
        </EmptyState>
        <EmptyState v-else :icon="Rocket" :title="t('web.campaigns.emptyTitle')" :description="t('web.campaigns.emptyHelp')">
          <template v-if="can('campaigns:manage')" #action>
            <Button size="sm" @click="router.push({ name: 'campaign-new' })"><Plus />{{ t('campaigns.newCampaign') }}</Button>
          </template>
        </EmptyState>
      </template>
    </DataTable>
  </Page>

  <ConfirmDialog
    v-model:open="changeOpen"
    :destructive="change?.status === 'cancelled'"
    :title="changeLabel"
    :description="change?.status === 'scheduled' ? t('campaigns.confirmSchedule') : change?.campaign.name"
    :confirm-label="changeLabel"
    :pending="setStatus.isPending.value"
    @confirm="confirmChange"
  />

  <PreviewDialog v-model:open="previewOpen" :title="previewing?.name ?? ''" :html="preview.data.value" :pending="preview.isPending.value" />

  <PromptDialog
    v-model:open="cloneOpen"
    :title="t('globals.buttons.clone')"
    :label="t('globals.fields.name')"
    :initial="cloning ? t('campaigns.copyOf', { name: cloning.name }) : ''"
    :confirm-label="t('globals.buttons.clone')"
    :pending="clone.isPending.value"
    @submit="doClone"
  />

  <ConfirmDialog
    v-model:open="deleteOpen"
    destructive
    :title="t('globals.messages.confirm')"
    :description="t('campaigns.confirmDelete', { name: toDelete?.name })"
    :confirm-label="t('globals.buttons.delete')"
    :pending="remove.isPending.value"
    @confirm="confirmDelete"
  />

  <ConfirmDialog
    v-model:open="bulkOpen"
    destructive
    :title="t('globals.messages.confirmDelete', { num: n(sel.count), name: t('globals.terms.campaign', sel.count).toLowerCase() })"
    :confirm-label="t('globals.buttons.delete')"
    :pending="bulkDelete.isPending.value"
    @confirm="runBulkDelete"
  />
</template>
