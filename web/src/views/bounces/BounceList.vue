<script setup lang="ts">
import { Trash2, UserX, X } from '@lucide/vue'
import type { PaginationState, RowSelectionState, SortingState } from '@tanstack/vue-table'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { BounceQuery } from '@/api/bounces'
import type { BounceRecord } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useBlocklistBounced, useBounces, useDeleteBounces } from '@/composables/queries/useBounces'
import { usePermission } from '@/composables/usePermission'
import { useUrlState } from '@/composables/useUrlState'
import { createColumns } from '@/features/bounces/columns'

const { t, n } = useI18n()
const { can } = usePermission()
const canManage = computed(() => can('bounces:manage'))

// --- URL state: campaign and source filters, page and sort. --------------------------------------
const url = useUrlState(['bounces'])
const campaignId = computed(() => Number(url.query.value.campaign_id) || undefined)
const source = computed(() => (url.query.value.source as string) ?? '')

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

const filter = computed(() => ({ campaignId: campaignId.value, source: source.value }))
const query = computed<BounceQuery>(() => ({
  ...filter.value,
  page: pagination.value.pageIndex + 1,
  perPage: pagination.value.pageSize,
  orderBy: sorting.value[0]?.id as BounceQuery['orderBy'],
  order: sorting.value[0] ? (sorting.value[0].desc ? 'desc' : 'asc') : undefined,
}))

const { data, isPending } = useBounces(query)
const total = computed(() => data.value?.total ?? 0)

// Selection can span pages, so remember which subscriber each bounce row belongs to.
const subscriberOf = new Map<number, number>()
watch(
  data,
  (d) => d?.results.forEach((b) => subscriberOf.set(b.id!, b.subscriber_id!)),
  { immediate: true },
)

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

// --- Actions. -----------------------------------------------------------------------------------
const confirm = ref<'delete' | 'blocklist' | null>(null)
const confirmOpen = computed({ get: () => confirm.value !== null, set: (o) => !o && (confirm.value = null) })
const del = useDeleteBounces()
const blocklist = useBlocklistBounced()
const pending = computed(() => del.isPending.value || blocklist.isPending.value)

function runConfirmed() {
  const done = (msg: string) => () => {
    toast.success(msg)
    confirm.value = null
    clearSelection()
  }
  if (confirm.value === 'delete') {
    del.mutate(selectAll.value ? { filter: filter.value } : { ids: selectedIds.value }, {
      onSuccess: (num) => done(t('globals.messages.deletedCount', { name: t('globals.terms.bounces'), num }))(),
    })
  } else {
    const subscriberIds = [...new Set(selectedIds.value.map((id) => subscriberOf.get(id)).filter((v): v is number => !!v))]
    blocklist.mutate(selectAll.value ? { filter: filter.value } : { subscriberIds }, {
      onSuccess: () => done(t('globals.messages.done'))(),
    })
  }
}

const rowToDelete = ref<BounceRecord | null>(null)
const rowDeleteOpen = computed({ get: () => !!rowToDelete.value, set: (o) => !o && (rowToDelete.value = null) })
function confirmDeleteOne() {
  const b = rowToDelete.value!
  del.mutate(
    { ids: [b.id!] },
    {
      onSuccess: () => {
        toast.success(t('globals.messages.deleted', { name: b.email }))
        rowToDelete.value = null
      },
    },
  )
}

const detail = ref<BounceRecord | null>(null)
const detailOpen = computed({ get: () => !!detail.value, set: (o) => !o && (detail.value = null) })

const columns = createColumns({
  t,
  canManage: canManage.value,
  onFilterCampaign: (id) => url.set({ campaign_id: id, page: undefined }),
  onFilterSource: (s) => url.set({ source: s, page: undefined }),
  onDetails: (b) => (detail.value = b),
  onDelete: (b) => (rowToDelete.value = b),
})
</script>

<template>
  <div class="space-y-4 p-6">
    <h1 class="text-xl font-semibold">
      {{ t('globals.terms.bounces') }}
      <span v-if="data && total" class="text-muted-foreground tabular-nums">({{ n(total) }})</span>
    </h1>

    <div v-if="campaignId || source" class="flex flex-wrap items-center gap-2">
      <Badge v-if="campaignId" variant="secondary" class="gap-1 pr-1">
        {{ t('globals.terms.campaign', 1) }} #{{ campaignId }}
        <button type="button" class="rounded-full p-0.5 hover:bg-foreground/10" :aria-label="t('globals.buttons.clear')" @click="url.set({ campaign_id: undefined })">
          <X class="size-3" />
        </button>
      </Badge>
      <Badge v-if="source" variant="secondary" class="gap-1 pr-1">
        {{ t('bounces.source') }}: {{ source }}
        <button type="button" class="rounded-full p-0.5 hover:bg-foreground/10" :aria-label="t('globals.buttons.clear')" @click="url.set({ source: undefined })">
          <X class="size-3" />
        </button>
      </Badge>
    </div>

    <div v-if="selectedCount > 0" class="flex flex-wrap items-center gap-2 text-sm">
      <Button variant="ghost" size="sm" class="text-destructive" @click="confirm = 'delete'">
        <Trash2 />{{ t('globals.buttons.delete') }}
      </Button>
      <Button v-if="can('subscribers:manage')" variant="ghost" size="sm" @click="confirm = 'blocklist'">
        <UserX />{{ t('import.blocklist') }}
      </Button>
      <span class="text-muted-foreground">
        {{ t('globals.messages.numSelected', { num: n(selectedCount) }) }}
        <template v-if="canSelectAll">
          &mdash;
          <button type="button" class="underline" @click="selectAll = true">
            {{ t('subscribers.selectAll', { num: n(total) }) }}
          </button>
        </template>
        &middot;
        <button type="button" class="underline" @click="clearSelection">{{ t('globals.buttons.clear') }}</button>
      </span>
    </div>

    <DataTable
      v-model:pagination="pagination"
      v-model:sorting="sorting"
      v-model:selection="selection"
      :columns="columns"
      :data="data?.results ?? []"
      :row-count="total"
      :loading="isPending"
      :row-id="(b: BounceRecord) => String(b.id)"
    />
  </div>

  <ConfirmDialog
    v-model:open="confirmOpen"
    :destructive="confirm === 'delete'"
    :title="t('globals.messages.confirm')"
    :description="t('web.bounces.confirmCount', { num: n(selectedCount) })"
    :confirm-label="confirm === 'delete' ? t('globals.buttons.delete') : t('import.blocklist')"
    :pending="pending"
    @confirm="runConfirmed"
  />
  <ConfirmDialog
    v-model:open="rowDeleteOpen"
    destructive
    :title="t('globals.messages.confirm')"
    :description="rowToDelete?.email"
    :confirm-label="t('globals.buttons.delete')"
    :pending="del.isPending.value"
    @confirm="confirmDeleteOne"
  />

  <Dialog v-model:open="detailOpen">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ detail?.email }}</DialogTitle>
        <DialogDescription>{{ detail?.source }} · {{ detail?.type }}</DialogDescription>
      </DialogHeader>
      <pre class="box max-h-96 overflow-auto bg-muted/30 p-3 text-xs" data-cy="bounce-meta">{{ JSON.stringify(detail?.meta, null, 2) }}</pre>
    </DialogContent>
  </Dialog>
</template>
