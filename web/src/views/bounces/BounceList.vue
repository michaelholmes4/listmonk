<script setup lang="ts">
import { MailCheck, Trash2, UserX, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { BounceQuery } from '@/api/bounces'
import type { BounceRecord } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import DataTableToolbar from '@/components/datatable/DataTableToolbar.vue'
import EmptyState from '@/components/EmptyState.vue'
import Page from '@/components/layout/Page.vue'
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
import { useRowSelection, useUrlTable } from '@/composables/useTableState'
import { useUrlState } from '@/composables/useUrlState'
import { createColumns } from '@/features/bounces/columns'

const { t, n } = useI18n()
const { can } = usePermission()
const canManage = computed(() => can('bounces:manage'))

// --- URL state: campaign and source filters, page and sort. --------------------------------------
const url = useUrlState(['bounces'])
const campaignId = computed(() => Number(url.query.value.campaign_id) || undefined)
const source = computed(() => (url.query.value.source as string) ?? '')

const { pagination, sorting, apiPage } = useUrlTable(url)

const filter = computed(() => ({ campaignId: campaignId.value, source: source.value }))
const query = computed<BounceQuery>(() => ({ ...filter.value, ...apiPage<NonNullable<BounceQuery['orderBy']>>() }))

const { data, isPending } = useBounces(query)
const total = computed(() => data.value?.total ?? 0)

// Selection can span pages, so remember which subscriber each bounce row belongs to.
const subscriberOf = new Map<number, number>()
watch(
  data,
  (d) => d?.results.forEach((b) => subscriberOf.set(b.id!, b.subscriber_id!)),
  { immediate: true },
)

const sel = useRowSelection({
  total,
  pageRows: computed(() => data.value?.results.length ?? 0),
  filter,
  onFilterChange: () => url.set({ page: undefined }),
})

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
    sel.clear()
  }
  if (confirm.value === 'delete') {
    del.mutate(sel.selectAll ? { filter: filter.value } : { ids: sel.ids }, {
      onSuccess: (num) => done(t('globals.messages.deletedCount', { name: t('globals.terms.bounces'), num }))(),
    })
  } else {
    const subscriberIds = [...new Set(sel.ids.map((id) => subscriberOf.get(id)).filter((v): v is number => !!v))]
    blocklist.mutate(sel.selectAll ? { filter: filter.value } : { subscriberIds }, {
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
  <Page :title="t('globals.terms.bounces')" :count="data ? total : undefined">
    <DataTableToolbar
      v-if="campaignId || source || sel.count"
      :selected="sel.count"
      :total="total"
      :can-select-all="sel.canSelectAll"
      @select-all="sel.selectAll = true"
      @clear="sel.clear"
    >
      <!-- Filters are set by clicking a campaign or source in the table; they show here as removable chips. -->
      <Badge v-if="campaignId" variant="secondary" class="h-7 gap-1 pr-1" data-cy="filter-campaign">
        {{ t('globals.terms.campaign', 1) }} #{{ campaignId }}
        <button type="button" class="rounded-full p-0.5 hover:bg-foreground/10" :aria-label="t('globals.buttons.clear')" @click="url.set({ campaign_id: undefined })">
          <X class="size-3" />
        </button>
      </Badge>
      <Badge v-if="source" variant="secondary" class="h-7 gap-1 pr-1" data-cy="filter-source">
        {{ t('bounces.source') }}: {{ source }}
        <button type="button" class="rounded-full p-0.5 hover:bg-foreground/10" :aria-label="t('globals.buttons.clear')" @click="url.set({ source: undefined })">
          <X class="size-3" />
        </button>
      </Badge>
      <template #bulk>
        <Button v-if="can('subscribers:manage')" variant="ghost" size="sm" @click="confirm = 'blocklist'">
          <UserX />{{ t('import.blocklist') }}
        </Button>
        <Button variant="ghost" size="sm" class="text-destructive" @click="confirm = 'delete'">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </Button>
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
      :row-id="(b: BounceRecord) => String(b.id)"
    >
      <template #empty>
        <EmptyState v-if="campaignId || source" :title="t('web.common.noResults')" :description="t('web.common.noResultsHelp')">
          <template #action>
            <Button variant="outline" size="sm" @click="url.set({ campaign_id: undefined, source: undefined })">{{ t('web.common.clearFilters') }}</Button>
          </template>
        </EmptyState>
        <EmptyState v-else :icon="MailCheck" :title="t('web.bounces.emptyTitle')" :description="t('web.bounces.emptyHelp')" />
      </template>
    </DataTable>
  </Page>

  <ConfirmDialog
    v-model:open="confirmOpen"
    :destructive="confirm === 'delete'"
    :title="t('globals.messages.confirm')"
    :description="t('web.bounces.confirmCount', { num: n(sel.count) })"
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
