<script setup lang="ts">
import { Archive, List as ListIcon, Plus, Trash2 } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { ListQuery } from '@/api/lists'
import type { List } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import DataTableToolbar from '@/components/datatable/DataTableToolbar.vue'
import SearchInput from '@/components/datatable/SearchInput.vue'
import EmptyState from '@/components/EmptyState.vue'
import Page from '@/components/layout/Page.vue'
import SlowQueriesNote from '@/components/SlowQueriesNote.vue'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  useBulkDeleteLists,
  useCreateOptinCampaign,
  useDeleteList,
  useLists,
} from '@/composables/queries/useLists'
import { usePermission } from '@/composables/usePermission'
import { useRowSelection, useUrlTable } from '@/composables/useTableState'
import { useUrlState } from '@/composables/useUrlState'
import { createColumns } from '@/features/lists/columns'

const { t, n } = useI18n()
const router = useRouter()
const { can, canList } = usePermission()

// --- URL state: archived toggle, search, page and sort (`status`, `q`, `page`, `size`, `sort`). ---
const url = useUrlState(['lists'])
const status = computed<'active' | 'archived'>({
  get: () => (url.query.value.status === 'archived' ? 'archived' : 'active'),
  set: (v) => url.set({ status: v === 'archived' ? v : undefined }),
})
const search = url.str('q')
const { pagination, sorting, apiPage } = useUrlTable(url)

const filter = computed(() => ({ query: search.value, status: status.value }))
const query = computed<ListQuery>(() => ({ ...filter.value, ...apiPage<NonNullable<ListQuery['orderBy']>>() }))

const { data, isPending } = useLists(query)
const total = computed(() => data.value?.total ?? 0)

const sel = useRowSelection({
  total,
  pageRows: computed(() => data.value?.results.length ?? 0),
  filter,
  onFilterChange: () => url.set({ page: undefined }),
})

// --- Actions. -----------------------------------------------------------------------------------
const bulkConfirm = ref(false)
const bulkDelete = useBulkDeleteLists()
function runBulkDelete() {
  bulkDelete.mutate(sel.selectAll ? { filter: filter.value } : { ids: sel.ids }, {
    onSuccess: (num) => {
      toast.success(t('globals.messages.deletedCount', { name: t('globals.terms.list', num), num }))
      bulkConfirm.value = false
      sel.clear()
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
    { onSuccess: (c) => router.push({ name: 'campaign', params: { id: c.id }, query: { tab: 'content' } }) },
  )
}

const columns = createColumns({
  t,
  n,
  canViewSubscribers: can('subscribers:get_all', 'subscribers:get'),
  canManage: (l) => canList(l.id!, 'list:manage') && can('campaigns:manage'),
  onEdit: (l) => router.push({ name: 'list', params: { id: l.id } }),
  onDelete: (l) => (rowToDelete.value = l),
  onOptinCampaign: (l) => (optinList.value = l),
})
</script>

<template>
  <Page :title="t('globals.terms.lists')" :count="data ? total : undefined">
    <template #actions>
      <Button v-if="can('lists:manage_all')" size="sm" data-cy="btn-new" @click="router.push({ name: 'list-new' })">
        <Plus />{{ t('lists.newList') }}
      </Button>
    </template>

    <DataTableToolbar :selected="sel.count" :total="total" :can-select-all="sel.canSelectAll" @select-all="sel.selectAll = true" @clear="sel.clear">
      <SearchInput v-model="search" :placeholder="t('globals.fields.name')" />
      <ToggleGroup v-model="status" type="single" variant="outline" size="sm" :aria-label="t('globals.fields.status')" data-cy="list-status">
        <ToggleGroupItem value="active" data-cy="view-active">{{ t('web.lists.active') }}</ToggleGroupItem>
        <ToggleGroupItem value="archived" data-cy="view-archived">{{ t('lists.archived') }}</ToggleGroupItem>
      </ToggleGroup>
      <template v-if="can('lists:manage_all')" #bulk>
        <Button variant="ghost" size="sm" class="text-destructive" @click="bulkConfirm = true"><Trash2 />{{ t('globals.buttons.delete') }}</Button>
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
      :row-id="(l: List) => String(l.id)"
    >
      <template #empty>
        <EmptyState v-if="search" :title="t('web.common.noResults')" :description="t('web.common.noResultsHelp')">
          <template #action><Button variant="outline" size="sm" @click="search = ''">{{ t('web.common.clearFilters') }}</Button></template>
        </EmptyState>
        <EmptyState v-else-if="status === 'archived'" :icon="Archive" :title="t('web.lists.emptyArchived')" :description="t('lists.archivedHelp')" />
        <EmptyState v-else :icon="ListIcon" :title="t('web.lists.emptyTitle')" :description="t('web.lists.emptyHelp')">
          <template v-if="can('lists:manage_all')" #action>
            <Button size="sm" @click="router.push({ name: 'list-new' })"><Plus />{{ t('lists.newList') }}</Button>
          </template>
        </EmptyState>
      </template>
    </DataTable>

    <SlowQueriesNote />
  </Page>

  <ConfirmDialog
    v-model:open="bulkConfirm"
    destructive
    :title="t('globals.messages.confirmDelete', { num: n(sel.count), name: t('globals.terms.list', sel.count).toLowerCase() })"
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
