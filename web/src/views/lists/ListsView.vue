<script setup lang="ts">
import { Plus, Search, Trash2 } from '@lucide/vue'
import type { PaginationState, RowSelectionState, SortingState } from '@tanstack/vue-table'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { ListQuery } from '@/api/lists'
import type { List } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useBulkDeleteLists,
  useCreateOptinCampaign,
  useDeleteList,
  useLists,
} from '@/composables/queries/useLists'
import { usePermission } from '@/composables/usePermission'
import { createColumns } from '@/features/lists/columns'
import ListSheet from '@/features/lists/ListSheet.vue'

const { t, n } = useI18n()
const route = useRoute()
const router = useRouter()
const { can, canList } = usePermission()

// --- Route state: archived toggle (?status=) and which sheet is open. ----------------------------
const status = computed<'active' | 'archived'>(() => (route.query.status === 'archived' ? 'archived' : 'active'))
const sheetId = computed(() => (route.params.id ? Number(route.params.id) : undefined))
const sheetOpen = computed({
  get: () => route.name === 'list' || route.name === 'list-new',
  set: (o) => {
    if (!o) router.push({ name: 'lists', query: route.query })
  },
})

// --- Table state. -------------------------------------------------------------------------------
const searchInput = ref('')
const search = ref('') // applied on submit, like the classic screen
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 20 })
const sorting = ref<SortingState>([])
const selection = ref<RowSelectionState>({})
const selectAll = ref(false)

const filter = computed(() => ({ query: search.value, status: status.value }))
const query = computed<ListQuery>(() => ({
  ...filter.value,
  page: pagination.value.pageIndex + 1,
  perPage: pagination.value.pageSize,
  orderBy: sorting.value[0]?.id as ListQuery['orderBy'],
  order: sorting.value[0] ? (sorting.value[0].desc ? 'DESC' : 'ASC') : undefined,
}))

const { data, isPending } = useLists(query)
const total = computed(() => data.value?.total ?? 0)

watch(filter, () => {
  pagination.value = { ...pagination.value, pageIndex: 0 }
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

// --- Actions. -----------------------------------------------------------------------------------
const bulkConfirm = ref(false)
const bulkDelete = useBulkDeleteLists()
function runBulkDelete() {
  bulkDelete.mutate(selectAll.value ? { filter: filter.value } : { ids: selectedIds.value }, {
    onSuccess: (num) => {
      toast.success(t('globals.messages.deletedCount', { name: t('globals.terms.list', num), num }))
      bulkConfirm.value = false
      clearSelection()
    },
  })
}

const rowToDelete = ref<List | null>(null)
const rowDeleteOpen = computed({ get: () => !!rowToDelete.value, set: (o) => !o && (rowToDelete.value = null) })
const deleteOne = useDeleteList()
function confirmDeleteOne() {
  const l = rowToDelete.value!
  deleteOne.mutate(l.id!, {
    onSuccess: () => {
      toast.success(t('globals.messages.deleted', { name: l.name }))
      rowToDelete.value = null
    },
  })
}

// The campaign editor isn't ported yet, so hand off to the classic one once the draft exists.
const optinList = ref<List | null>(null)
const optinOpen = computed({ get: () => !!optinList.value, set: (o) => !o && (optinList.value = null) })
const optinCampaign = useCreateOptinCampaign()
function createOptin() {
  const l = optinList.value!
  optinCampaign.mutate(
    { list: { id: l.id!, name: l.name! }, t },
    { onSuccess: (c) => window.location.assign(`/admin/campaigns/${c.id}#content`) },
  )
}

const columns = createColumns({
  t,
  n,
  canViewSubscribers: can('subscribers:get_all', 'subscribers:get'),
  canManage: (l) => canList(l.id!, 'list:manage') && can('campaigns:manage'),
  onEdit: (l) => router.push({ name: 'list', params: { id: l.id }, query: route.query }),
  onDelete: (l) => (rowToDelete.value = l),
  onOptinCampaign: (l) => (optinList.value = l),
})
</script>

<template>
  <Teleport defer to="#page-actions">
    <Button v-if="can('lists:manage_all')" size="sm" @click="router.push({ name: 'list-new', query: route.query })">
      <Plus />{{ t('globals.buttons.new') }}
    </Button>
  </Teleport>

  <div class="space-y-4 p-6">
    <div class="space-y-1">
      <h1 class="text-xl font-semibold">
        {{ t('globals.terms.lists') }}
        <span v-if="status === 'archived'" class="font-normal text-muted-foreground">/ {{ t('lists.archived').toLowerCase() }}</span>
        <span v-if="data" class="text-muted-foreground tabular-nums">({{ n(total) }})</span>
      </h1>
      <RouterLink
        class="text-xs text-primary hover:underline"
        :to="{ name: 'lists', query: status === 'archived' ? {} : { status: 'archived' } }"
      >
        {{ t('globals.buttons.view') }}
        {{ (status === 'archived' ? t('menu.allLists') : t('lists.archived')).toLowerCase() }} &rarr;
      </RouterLink>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <form class="relative min-w-64 max-w-sm flex-1" @submit.prevent="search = searchInput">
        <Search class="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input v-model="searchInput" class="pl-8" :placeholder="t('globals.fields.name')" :aria-label="t('globals.fields.name')" />
      </form>
      <template v-if="selectedCount > 0">
        <Button v-if="can('lists:manage_all')" variant="ghost" size="sm" class="text-destructive" @click="bulkConfirm = true">
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
      :row-id="(l: List) => String(l.id)"
    />
  </div>

  <ListSheet :id="sheetId" v-model:open="sheetOpen" />

  <ConfirmDialog
    v-model:open="bulkConfirm"
    destructive
    :title="t('globals.messages.confirmDelete', { num: n(selectedCount), name: t('globals.terms.list', selectedCount).toLowerCase() })"
    :description="t('lists.confirmDelete')"
    :confirm-label="t('globals.buttons.delete')"
    :pending="bulkDelete.isPending.value"
    @confirm="runBulkDelete"
  />

  <ConfirmDialog
    v-model:open="rowDeleteOpen"
    destructive
    :title="t('globals.messages.confirm')"
    :description="`${rowToDelete?.name ?? ''} — ${t('lists.confirmDelete')}`"
    :confirm-label="t('globals.buttons.delete')"
    :pending="deleteOne.isPending.value"
    @confirm="confirmDeleteOne"
  />

  <ConfirmDialog
    v-model:open="optinOpen"
    :title="t('lists.sendOptinCampaign')"
    :description="optinList?.name"
    :pending="optinCampaign.isPending.value"
    @confirm="createOptin"
  />
</template>
