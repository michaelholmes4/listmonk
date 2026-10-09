<script setup lang="ts">
import { Download, ListChecks, Plus, Search, Settings2, Trash2, Upload, Users, UserX } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { exportURL, type SubscriberFilter, type SubscriberQuery } from '@/api/subscribers'
import type { Subscriber } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import DataTableToolbar from '@/components/datatable/DataTableToolbar.vue'
import FilterSelect from '@/components/datatable/FilterSelect.vue'
import SearchInput from '@/components/datatable/SearchInput.vue'
import EmptyState from '@/components/EmptyState.vue'
import Page from '@/components/layout/Page.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAllLists } from '@/composables/queries/useLists'
import {
  useBulkBlocklist,
  useBulkDelete,
  useDeleteSubscriber,
  useSubscribers,
  type BulkTarget,
} from '@/composables/queries/useSubscribers'
import { usePermission } from '@/composables/usePermission'
import { useRowSelection, useUrlTable } from '@/composables/useTableState'
import { useUrlState } from '@/composables/useUrlState'
import BulkListsDialog from '@/features/subscribers/BulkListsDialog.vue'
import { createColumns } from '@/features/subscribers/columns'

const { t, n } = useI18n()
const router = useRouter()
const { can } = usePermission()

// --- URL state: list filter (path), subscription status, search, page and sort (query). -----------
const url = useUrlState(['subscribers', 'subscribers-list'])
const listID = computed(() => (url.params.value.listID ? Number(url.params.value.listID) : undefined))
const subStatus = computed(() => (listID.value ? ((url.query.value.subscription_status as string) ?? '') : ''))
const backRoute = () => (listID.value ? { name: 'subscribers-list', params: { listID: listID.value } } : { name: 'subscribers' })

const { data: lists } = useAllLists()
const listFilter = computed({
  get: () => (listID.value ? String(listID.value) : undefined),
  set: (v) => router.push(v ? { name: 'subscribers-list', params: { listID: v } } : { name: 'subscribers' }),
})
const listOptions = computed(() => (lists.value ?? []).map((l) => ({ value: String(l.id), label: l.name ?? '' })))
// Subscription status only means something within one list.
const statusFilter = computed({
  get: () => subStatus.value || undefined,
  set: (v) => router.push({ ...backRoute(), query: v ? { subscription_status: v } : {} }),
})
const statusOptions = computed(() => ['unconfirmed', 'confirmed', 'unsubscribed'].map((s) => ({ value: s, label: t(`subscribers.status.${s}`) })))

// --- Search: simple (debounced) or an advanced SQL expression. ----------------------------------
const search = url.str('q')
const urlSql = url.str('sql')
const advanced = ref(!!urlSql.value)
const queryDraft = ref(urlSql.value)

function toggleAdvanced() {
  advanced.value = !advanced.value
  if (!advanced.value) {
    queryDraft.value = ''
    urlSql.value = ''
    return
  }
  // Carry a simple search over as an equivalent expression.
  const q = search.value.trim().replace(/'/g, "''")
  search.value = ''
  queryDraft.value = !q ? '' : q.includes('@') && !q.includes(' ') ? `email = '${q.toLowerCase()}'` : `(name ~* '${q}' OR email ~* '${q.toLowerCase()}')`
}
const runQuery = () => (urlSql.value = queryDraft.value.trim())

// --- Table state: page and sort live in the URL too. -----------------------------------------------
const { pagination, sorting, apiPage } = useUrlTable(url)

const filter = computed<SubscriberFilter>(() => ({
  search: advanced.value ? '' : search.value.toLowerCase(),
  query: advanced.value ? urlSql.value : '',
  listIds: listID.value ? [listID.value] : [],
  subscriptionStatus: subStatus.value,
}))
const filtered = computed(() => !!(filter.value.search || filter.value.query || listID.value))
function clearFilters() {
  if (advanced.value) toggleAdvanced()
  search.value = ''
  router.push({ name: 'subscribers' })
}

const query = computed<SubscriberQuery>(() => ({ ...filter.value, ...apiPage<NonNullable<SubscriberQuery['orderBy']>>() }))

const { data, isPending } = useSubscribers(query)
const total = computed(() => data.value?.total ?? 0)

const sel = useRowSelection({
  total,
  pageRows: computed(() => data.value?.results.length ?? 0),
  filter,
  onFilterChange: () => url.set({ page: undefined }),
})
const target = computed<BulkTarget>(() => (sel.selectAll ? { filter: filter.value } : { ids: sel.ids }))

// --- Actions. -----------------------------------------------------------------------------------
const bulkListsOpen = ref(false)
const confirm = ref<'delete' | 'blocklist' | 'export' | null>(null)
const confirmOpen = computed({ get: () => confirm.value !== null, set: (o) => !o && (confirm.value = null) })

const bulkDelete = useBulkDelete()
const bulkBlocklist = useBulkBlocklist()

function runConfirmed() {
  const num = sel.count
  const done = (msg: string) => () => {
    toast.success(msg)
    confirm.value = null
    sel.clear()
  }
  if (confirm.value === 'delete') bulkDelete.mutate(target.value, { onSuccess: done(t('subscribers.subscribersDeleted', { num })) })
  else if (confirm.value === 'blocklist')
    bulkBlocklist.mutate(target.value, { onSuccess: done(t('globals.messages.updated', { name: n(num) })) })
  else if (confirm.value === 'export') {
    window.location.assign(exportURL(filter.value, sel.selectAll ? [] : sel.ids))
    confirm.value = null
  }
}
const confirmPending = computed(() => bulkDelete.isPending.value || bulkBlocklist.isPending.value)
const confirmTitle = computed(() => {
  const num = confirm.value === 'export' && !sel.ids.length ? total.value : sel.count
  return t(`subscribers.confirm${{ delete: 'Delete', blocklist: 'Blocklist', export: 'Export' }[confirm.value ?? 'export']}`, { num })
})

// Single-row delete.
const rowToDelete = ref<Subscriber | null>(null)
const deleteOne = useDeleteSubscriber()
const rowDeleteOpen = computed({ get: () => !!rowToDelete.value, set: (o) => !o && (rowToDelete.value = null) })
function confirmDeleteOne() {
  const s = rowToDelete.value!
  deleteOne.mutate(s.id!, {
    onSuccess: () => {
      toast.success(t('globals.messages.deleted', { name: s.name || s.email }))
      rowToDelete.value = null
    },
  })
}

const columns = createColumns({
  t,
  onEdit: (s) => router.push({ name: 'subscriber', params: { id: s.id } }),
  onDelete: (s) => (rowToDelete.value = s),
})
</script>

<template>
  <Page :title="t('globals.terms.subscribers')" :count="data ? total : undefined">
    <template #actions>
      <Button v-if="can('subscribers:import')" variant="outline" size="sm" @click="router.push({ name: 'import', query: listID ? { list_id: listID } : {} })">
        <Upload />{{ t('menu.import') }}
      </Button>
      <Button v-if="can('subscribers:manage')" size="sm" data-cy="btn-new" @click="router.push({ name: 'subscriber-new' })">
        <Plus />{{ t('subscribers.newSubscriber') }}
      </Button>
    </template>

    <DataTableToolbar :selected="sel.count" :total="total" :can-select-all="sel.canSelectAll" @select-all="sel.selectAll = true" @clear="sel.clear">
      <SearchInput v-if="!advanced" v-model="search" :placeholder="t('subscribers.queryPlaceholder')" />
      <FilterSelect v-model="listFilter" :label="t('globals.terms.list', 1)" :options="listOptions" />
      <FilterSelect v-if="listID" v-model="statusFilter" :label="t('globals.terms.subscriptions', 1)" :options="statusOptions" />
      <Button v-if="!advanced && can('subscribers:sql_query')" variant="ghost" size="sm" @click="toggleAdvanced">
        <Settings2 />{{ t('subscribers.advancedQuery') }}
      </Button>
      <template #end>
        <Button variant="outline" size="sm" @click="confirm = 'export'"><Download />{{ t('subscribers.export') }}</Button>
      </template>
      <template #bulk>
        <template v-if="can('subscribers:manage')">
          <Button variant="ghost" size="sm" @click="bulkListsOpen = true"><ListChecks />{{ t('subscribers.manageLists') }}</Button>
          <Button variant="ghost" size="sm" @click="confirm = 'blocklist'"><UserX />{{ t('import.blocklist') }}</Button>
        </template>
        <Button variant="ghost" size="sm" @click="confirm = 'export'"><Download />{{ t('subscribers.export') }}</Button>
        <Button v-if="can('subscribers:manage')" variant="ghost" size="sm" class="text-destructive" @click="confirm = 'delete'">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </Button>
      </template>
    </DataTableToolbar>

    <!-- Advanced query: an SQL expression instead of the search box. -->
    <form v-if="advanced" class="space-y-2 rounded-lg border p-3" data-cy="advanced-query" @submit.prevent="runQuery">
      <Textarea
        v-model="queryDraft"
        class="font-mono text-xs"
        :aria-label="t('subscribers.advancedQuery')"
        placeholder="subscribers.name LIKE '%user%' or subscribers.status='blocklisted'"
        @keydown.ctrl.enter.prevent="runQuery"
        @keydown.meta.enter.prevent="runQuery"
      />
      <div class="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm"><Search />{{ t('subscribers.query') }}</Button>
        <Button type="button" size="sm" variant="outline" @click="toggleAdvanced">{{ t('subscribers.reset') }}</Button>
        <p class="text-xs text-muted-foreground">
          {{ t('subscribers.advancedQueryHelp') }}.
          <a href="https://listmonk.app/docs/querying-and-segmentation" target="_blank" rel="noopener noreferrer" class="link-style">
            {{ t('globals.buttons.learnMore') }}
          </a>
        </p>
      </div>
    </form>

    <DataTable
      v-model:pagination="pagination"
      v-model:sorting="sorting"
      v-model:selection="sel.selection"
      :columns="columns"
      :data="data?.results ?? []"
      :row-count="total"
      :loading="isPending"
      :row-id="(s: Subscriber) => String(s.id)"
    >
      <template #empty>
        <EmptyState v-if="filtered" :title="t('web.common.noResults')" :description="t('web.common.noResultsHelp')">
          <template #action><Button variant="outline" size="sm" @click="clearFilters">{{ t('web.common.clearFilters') }}</Button></template>
        </EmptyState>
        <EmptyState v-else :icon="Users" :title="t('web.subscribers.emptyTitle')" :description="t('web.subscribers.emptyHelp')">
          <template #action>
            <Button v-if="can('subscribers:import')" variant="outline" size="sm" @click="router.push({ name: 'import' })"><Upload />{{ t('menu.import') }}</Button>
            <Button v-if="can('subscribers:manage')" size="sm" @click="router.push({ name: 'subscriber-new' })"><Plus />{{ t('subscribers.newSubscriber') }}</Button>
          </template>
        </EmptyState>
      </template>
    </DataTable>
  </Page>

  <BulkListsDialog v-model:open="bulkListsOpen" :target="target" :count="sel.count" />

  <ConfirmDialog
    v-model:open="confirmOpen"
    :destructive="confirm === 'delete' || confirm === 'blocklist'"
    :title="confirmTitle"
    :description="confirm === 'delete' ? t('globals.messages.confirm') : undefined"
    :pending="confirmPending"
    @confirm="runConfirmed"
  />

  <ConfirmDialog
    v-model:open="rowDeleteOpen"
    destructive
    :title="t('globals.messages.confirm')"
    :description="rowToDelete?.email"
    :confirm-label="t('globals.buttons.delete')"
    :pending="deleteOne.isPending.value"
    @confirm="confirmDeleteOne"
  />
</template>
