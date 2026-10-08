<script setup lang="ts">
import { Download, ListChecks, Plus, Search, Settings2, Trash2, UserX } from '@lucide/vue'
import type { PaginationState, RowSelectionState, SortingState } from '@tanstack/vue-table'
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { exportURL, type SubscriberFilter, type SubscriberQuery } from '@/api/subscribers'
import type { Subscriber } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAllLists } from '@/composables/queries/useLists'
import { useUrlState } from '@/composables/useUrlState'
import {
  useBulkBlocklist,
  useBulkDelete,
  useDeleteSubscriber,
  useSubscribers,
  type BulkTarget,
} from '@/composables/queries/useSubscribers'
import { usePermission } from '@/composables/usePermission'
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
const currentList = computed(() => lists.value?.find((l) => l.id === listID.value))

function setListFilter(v: unknown) {
  const id = v === ALL ? undefined : Number(v)
  router.push(id ? { name: 'subscribers-list', params: { listID: id } } : { name: 'subscribers' })
}
function setStatusFilter(v: unknown) {
  router.push({ ...backRoute(), query: v === ALL ? {} : { subscription_status: String(v) } })
}
const ALL = '__all'

// --- Search: simple (debounced) or an advanced SQL expression. ----------------------------------
const urlSearch = url.str('q')
const urlSql = url.str('sql')
const searchInput = ref(urlSearch.value)
const search = refDebounced(searchInput, 300)
watch(search, (v) => (urlSearch.value = v.trim()))
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
  const q = searchInput.value.trim().replace(/'/g, "''")
  searchInput.value = ''
  urlSearch.value = ''
  queryDraft.value = !q ? '' : q.includes('@') && !q.includes(' ') ? `email = '${q.toLowerCase()}'` : `(name ~* '${q}' OR email ~* '${q.toLowerCase()}')`
}
const runQuery = () => (urlSql.value = queryDraft.value.trim())

// --- Table state: page and sort live in the URL too (`page`, `size`, `sort=field:asc|desc`). -----
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

const filter = computed<SubscriberFilter>(() => ({
  search: advanced.value ? '' : urlSearch.value.toLowerCase(),
  query: advanced.value ? urlSql.value : '',
  listIds: listID.value ? [listID.value] : [],
  subscriptionStatus: subStatus.value,
}))

const query = computed<SubscriberQuery>(() => ({
  ...filter.value,
  page: pagination.value.pageIndex + 1,
  perPage: pagination.value.pageSize,
  orderBy: sorting.value[0]?.id as SubscriberQuery['orderBy'],
  order: sorting.value[0] ? (sorting.value[0].desc ? 'DESC' : 'ASC') : undefined,
}))

const { data, isPending, isFetching } = useSubscribers(query)
const total = computed(() => data.value?.total ?? 0)

// A different filter means different rows: go back to page 1 and drop the selection.
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
const target = computed<BulkTarget>(() => (selectAll.value ? { filter: filter.value } : { ids: selectedIds.value }))
const canSelectAll = computed(
  () => !selectAll.value && selectedIds.value.length > 0 && total.value > selectedIds.value.length,
)

// --- Actions. -----------------------------------------------------------------------------------
const bulkListsOpen = ref(false)
const confirm = ref<'delete' | 'blocklist' | 'export' | null>(null)
const confirmOpen = computed({ get: () => confirm.value !== null, set: (o) => !o && (confirm.value = null) })

const bulkDelete = useBulkDelete()
const bulkBlocklist = useBulkBlocklist()

function clearSelection() {
  selection.value = {}
  selectAll.value = false
}

function runConfirmed() {
  const num = selectedCount.value
  const done = (msg: string) => () => {
    toast.success(msg)
    confirm.value = null
    clearSelection()
  }
  if (confirm.value === 'delete') bulkDelete.mutate(target.value, { onSuccess: done(t('subscribers.subscribersDeleted', { num })) })
  else if (confirm.value === 'blocklist')
    bulkBlocklist.mutate(target.value, { onSuccess: done(t('globals.messages.updated', { name: n(num) })) })
  else if (confirm.value === 'export') {
    window.location.assign(exportURL(filter.value, selectAll.value ? [] : selectedIds.value))
    confirm.value = null
  }
}
const confirmPending = computed(() => bulkDelete.isPending.value || bulkBlocklist.isPending.value)
const confirmTitle = computed(() => {
  const num = confirm.value === 'export' && !selectedIds.value.length ? total.value : selectedCount.value
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
  <Teleport defer to="#page-actions">
    <Button v-if="can('subscribers:manage')" size="sm" @click="router.push({ name: 'subscriber-new' })">
      <Plus />{{ t('globals.buttons.new') }}
    </Button>
  </Teleport>

  <div class="space-y-4 p-6">
    <h1 class="text-xl font-semibold">
      {{ t('globals.terms.subscribers') }}
      <span v-if="data" class="text-muted-foreground tabular-nums">({{ n(total) }})</span>
      <span v-if="currentList" class="font-normal">
        &raquo; {{ currentList.name }}
        <span v-if="subStatus" class="text-sm text-muted-foreground capitalize">({{ subStatus }})</span>
      </span>
    </h1>

    <!-- Filters -->
    <div class="flex flex-wrap items-start gap-2">
      <form class="min-w-64 flex-1 space-y-2" @submit.prevent="advanced ? runQuery() : undefined">
        <div v-if="!advanced" class="relative">
          <Search class="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input v-model="searchInput" class="pl-8" :placeholder="t('subscribers.queryPlaceholder')" />
        </div>
        <template v-else>
          <Textarea
            v-model="queryDraft"
            class="font-mono text-xs"
            placeholder="subscribers.name LIKE '%user%' or subscribers.status='blocklisted'"
            @keydown.ctrl.enter.prevent="runQuery"
            @keydown.meta.enter.prevent="runQuery"
          />
          <p class="text-xs text-muted-foreground">
            {{ t('subscribers.advancedQueryHelp') }}.
            <a href="https://listmonk.app/docs/querying-and-segmentation" target="_blank" rel="noopener noreferrer" class="underline">
              {{ t('globals.buttons.learnMore') }}
            </a>
          </p>
          <div class="flex gap-2">
            <Button type="submit" size="sm"><Search />{{ t('subscribers.query') }}</Button>
            <Button type="button" size="sm" variant="outline" @click="toggleAdvanced">{{ t('subscribers.reset') }}</Button>
          </div>
        </template>
      </form>

      <Button v-if="!advanced && can('subscribers:sql_query')" variant="outline" size="sm" class="mt-0.5" @click="toggleAdvanced">
        <Settings2 />{{ t('subscribers.advancedQuery') }}
      </Button>

      <Select :model-value="listID ? String(listID) : ALL" @update:model-value="setListFilter">
        <SelectTrigger size="sm" class="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL">{{ t('globals.terms.lists') }}: {{ t('web.common.all') }}</SelectItem>
          <SelectItem v-for="l in lists" :key="l.id" :value="String(l.id)">{{ l.name }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-if="listID" :model-value="subStatus || ALL" @update:model-value="setStatusFilter">
        <SelectTrigger size="sm" class="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL">{{ t('web.common.all') }}</SelectItem>
          <SelectItem v-for="s in ['unconfirmed', 'confirmed', 'unsubscribed']" :key="s" :value="s">
            {{ t(`subscribers.status.${s}`) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Actions + bulk bar -->
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <Button variant="ghost" size="sm" @click="confirm = 'export'"><Download />{{ t('subscribers.export') }}</Button>
      <template v-if="selectedCount > 0 && can('subscribers:manage')">
        <Button variant="ghost" size="sm" @click="bulkListsOpen = true"><ListChecks />{{ t('subscribers.manageLists') }}</Button>
        <Button variant="ghost" size="sm" @click="confirm = 'blocklist'"><UserX />{{ t('subscribers.status.blocklisted') }}</Button>
        <Button variant="ghost" size="sm" class="text-destructive" @click="confirm = 'delete'">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </Button>
      </template>
      <span v-if="selectedCount > 0" class="text-muted-foreground">
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
      <span v-if="isFetching && !isPending" class="ml-auto text-xs text-muted-foreground">{{ t('web.common.refreshing') }}</span>
    </div>

    <DataTable
      v-model:pagination="pagination"
      v-model:sorting="sorting"
      v-model:selection="selection"
      :columns="columns"
      :data="data?.results ?? []"
      :row-count="total"
      :loading="isPending"
      :row-id="(s: Subscriber) => String(s.id)"
    />
  </div>

  <BulkListsDialog v-model:open="bulkListsOpen" :target="target" :count="selectedCount" />

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
