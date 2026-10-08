<script setup lang="ts">
import { Plus, Search, Trash2 } from '@lucide/vue'
import type { PaginationState, RowSelectionState, SortingState } from '@tanstack/vue-table'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { CampaignQuery, CampaignStatus } from '@/api/campaigns'
import type { Campaign } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import PreviewDialog from '@/components/PreviewDialog.vue'
import PromptDialog from '@/components/PromptDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { useUrlState } from '@/composables/useUrlState'
import { createColumns } from '@/features/campaigns/columns'

const { t, n } = useI18n()
const router = useRouter()
const { can } = usePermission()

// --- URL state: search, status, page and sort. ----------------------------------------------------
const url = useUrlState(['campaigns'])
const urlSearch = url.str('q')
const searchInput = ref(urlSearch.value)
const ALL = '__all'
const statuses: CampaignStatus[] = ['draft', 'scheduled', 'running', 'paused', 'finished', 'cancelled']
const status = computed(() => {
  const s = url.query.value.status as CampaignStatus | undefined
  return s && statuses.includes(s) ? s : undefined
})

const pagination = computed<PaginationState>({
  get: () => ({ pageIndex: url.int('page', 1) - 1, pageSize: url.int('size', 20) }),
  set: (v) => url.set({ page: v.pageIndex === 0 ? undefined : v.pageIndex + 1, size: v.pageSize === 20 ? undefined : v.pageSize }),
})
const sorting = computed<SortingState>({
  get: () => {
    const [id, dir] = ((url.query.value.sort as string) ?? '').split(':')
    return id ? [{ id, desc: dir === 'desc' }] : []
  },
  set: (v) => url.set({ sort: v[0] ? `${v[0].id}:${v[0].desc ? 'desc' : 'asc'}` : undefined, page: undefined }),
})
const selection = ref<RowSelectionState>({})
const selectAll = ref(false)

const filter = computed(() => ({ query: urlSearch.value, status: status.value }))
const query = computed<CampaignQuery>(() => ({
  ...filter.value,
  page: pagination.value.pageIndex + 1,
  perPage: pagination.value.pageSize,
  orderBy: sorting.value[0]?.id as CampaignQuery['orderBy'],
  // Default: newest first, like the classic screen.
  order: sorting.value[0] ? (sorting.value[0].desc ? 'desc' : 'asc') : 'desc',
}))

const { data, isPending } = useCampaigns(query)
const total = computed(() => data.value?.total ?? 0)
const { data: running } = useRunningStats()
const stats = computed(() => new Map((running.value ?? []).map((s) => [s.id!, s])))

watch(filter, () => {
  url.set({ page: undefined })
  selection.value = {}
  selectAll.value = false
})
watch(selection, () => {
  if (selectAll.value && Object.keys(selection.value).length < (data.value?.results.length ?? 0)) selectAll.value = false
})

const selectedIds = computed(() => Object.keys(selection.value).map(Number))
const selectedCount = computed(() => (selectAll.value ? total.value : selectedIds.value.length))
const canSelectAll = computed(() => !selectAll.value && selectedIds.value.length > 0 && total.value > selectedIds.value.length)
const clearSelection = () => {
  selection.value = {}
  selectAll.value = false
}

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
  bulkDelete.mutate(selectAll.value ? { filter: filter.value } : { ids: selectedIds.value }, {
    onSuccess: (num) => {
      toast.success(t('globals.messages.deletedCount', { name: t('globals.terms.campaigns'), num }))
      bulkOpen.value = false
      clearSelection()
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
  <Teleport defer to="#page-actions">
    <Button v-if="can('campaigns:manage')" size="sm" @click="router.push({ name: 'campaign-new' })">
      <Plus />{{ t('globals.buttons.new') }}
    </Button>
  </Teleport>

  <div class="space-y-4 p-6">
    <h1 class="text-xl font-semibold">
      {{ t('globals.terms.campaigns') }}
      <span v-if="data" class="text-muted-foreground tabular-nums">({{ n(total) }})</span>
    </h1>

    <div class="flex flex-wrap items-center gap-2">
      <form class="relative min-w-64 max-w-sm flex-1" @submit.prevent="urlSearch = searchInput.trim()">
        <Search class="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input v-model="searchInput" class="pl-8" :placeholder="t('campaigns.queryPlaceholder')" :aria-label="t('campaigns.queryPlaceholder')" />
      </form>
      <Select :model-value="status ?? ALL" @update:model-value="url.set({ status: $event === ALL ? undefined : String($event) })">
        <SelectTrigger size="sm" class="w-40" :aria-label="t('globals.fields.status')"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL">{{ t('globals.fields.status') }}: {{ t('web.common.all') }}</SelectItem>
          <SelectItem v-for="s in statuses" :key="s" :value="s">{{ t(`campaigns.status.${s}`) }}</SelectItem>
        </SelectContent>
      </Select>

      <template v-if="selectedCount > 0">
        <Button v-if="can('campaigns:manage')" variant="ghost" size="sm" class="text-destructive" @click="bulkOpen = true">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </Button>
        <span class="text-sm text-muted-foreground">
          {{ t('globals.messages.numSelected', { num: n(selectedCount) }) }}
          <template v-if="canSelectAll">
            &mdash;
            <button type="button" class="underline" @click="selectAll = true">
              {{ t('globals.messages.selectAll', { num: n(total) }) }}
            </button>
          </template>
          &middot;
          <button type="button" class="underline" @click="clearSelection">{{ t('globals.buttons.clear') }}</button>
        </span>
      </template>
    </div>

    <DataTable
      v-model:pagination="pagination"
      v-model:sorting="sorting"
      v-model:selection="selection"
      :columns="columns"
      :data="data?.results ?? []"
      :row-count="total"
      :loading="isPending"
      :row-id="(c: Campaign) => String(c.id)"
    />
  </div>

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
    :title="t('globals.messages.confirmDelete', { num: n(selectedCount), name: t('globals.terms.campaign', selectedCount).toLowerCase() })"
    :confirm-label="t('globals.buttons.delete')"
    :pending="bulkDelete.isPending.value"
    @confirm="runBulkDelete"
  />
</template>
