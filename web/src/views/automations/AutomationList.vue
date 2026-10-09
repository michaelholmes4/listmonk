<script setup lang="ts">
import { Plus, Workflow } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { AutomationQuery } from '@/api/automations'
import type { AutomationRow, AutomationStatus } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import DataTableToolbar from '@/components/datatable/DataTableToolbar.vue'
import FilterSelect from '@/components/datatable/FilterSelect.vue'
import SearchInput from '@/components/datatable/SearchInput.vue'
import EmptyState from '@/components/EmptyState.vue'
import Page from '@/components/layout/Page.vue'
import PromptDialog from '@/components/PromptDialog.vue'
import { Button } from '@/components/ui/button'
import {
  useArchiveAutomation,
  useAutomations,
  useCreateAutomation,
  useDeleteAutomation,
  usePauseAutomation,
  useResumeAutomation,
} from '@/composables/queries/useAutomations'
import { usePermission } from '@/composables/usePermission'
import { useUrlTable } from '@/composables/useTableState'
import { useUrlState } from '@/composables/useUrlState'
import { createColumns } from '@/features/automations/columns'
import { automationStatuses } from '@/features/automations/status'

const { t, n } = useI18n()
const router = useRouter()
const { can } = usePermission()

// --- URL state: search, status, page and sort. ---------------------------------------------------------
const url = useUrlState(['automations'])
const search = url.str('q')
const status = computed({
  get: () => {
    const s = url.query.value.status as AutomationStatus | undefined
    return s && automationStatuses.includes(s) ? s : undefined
  },
  set: (v) => url.set({ status: v }),
})
const statusOptions = computed(() => automationStatuses.map((s) => ({ value: s, label: t(`web.automations.status.${s}`) })))
const { pagination, sorting, apiPage } = useUrlTable(url)

const filter = computed(() => ({ query: search.value, status: status.value }))
const filtered = computed(() => !!(search.value || status.value))
const query = computed<AutomationQuery>(() => ({
  query: search.value,
  status: status.value ? [status.value] : undefined,
  ...apiPage<NonNullable<AutomationQuery['orderBy']>>('desc'),
}))
const { data, isPending } = useAutomations(query)
const total = computed(() => data.value?.total ?? 0)
watch(filter, () => url.set({ page: undefined }))

// --- Create: a name, then straight into the builder. ------------------------------------------------------
const createOpen = ref(false)
const create = useCreateAutomation()
function doCreate(name: string) {
  create.mutate(
    { name },
    {
      onSuccess: (a) => {
        createOpen.value = false
        router.push({ name: 'automation', params: { id: a.id } })
      },
    },
  )
}

// --- Lifecycle actions, each confirmed. --------------------------------------------------------------------
type Act = 'pause' | 'resume' | 'archive' | 'delete'
const acting = ref<{ row: AutomationRow; act: Act } | null>(null)
const actOpen = computed({ get: () => !!acting.value, set: (o) => !o && (acting.value = null) })
const pause = usePauseAutomation()
const resume = useResumeAutomation()
const archive = useArchiveAutomation()
const remove = useDeleteAutomation()
const pending = computed(() => pause.isPending.value || resume.isPending.value || archive.isPending.value || remove.isPending.value)
const actLabel = computed(() => (acting.value?.act === 'delete' ? t('globals.buttons.delete') : t(`web.automations.${acting.value?.act ?? 'pause'}`)))
function confirmAct() {
  const { row, act } = acting.value!
  const m = { pause, resume, archive, delete: remove }[act]
  m.mutate(row.id!, {
    onSuccess: () => {
      toast.success(t(act === 'delete' ? 'globals.messages.deleted' : 'globals.messages.updated', { name: row.name }))
      acting.value = null
    },
  })
}

const columns = createColumns({
  t,
  n,
  onEdit: (a) => router.push({ name: 'automation', params: { id: a.id } }),
  onPause: (a) => (acting.value = { row: a, act: 'pause' }),
  onResume: (a) => (acting.value = { row: a, act: 'resume' }),
  onArchive: (a) => (acting.value = { row: a, act: 'archive' }),
  onDelete: (a) => (acting.value = { row: a, act: 'delete' }),
})
</script>

<template>
  <Page :title="t('web.automations.title')" :count="data ? total : undefined">
    <template #actions>
      <Button v-if="can('automations:manage')" size="sm" data-cy="btn-new" @click="createOpen = true">
        <Plus />{{ t('web.automations.new') }}
      </Button>
    </template>

    <DataTableToolbar>
      <SearchInput v-model="search" :placeholder="t('web.automations.search')" />
      <FilterSelect v-model="status" :label="t('globals.fields.status')" :options="statusOptions" />
    </DataTableToolbar>

    <DataTable
      v-model:pagination="pagination"
      v-model:sorting="sorting"
      :columns="columns"
      :data="data?.results ?? []"
      :row-count="total"
      :loading="isPending"
      :row-id="(a: AutomationRow) => String(a.id)"
    >
      <template #empty>
        <EmptyState v-if="filtered" :title="t('web.common.noResults')" :description="t('web.common.noResultsHelp')">
          <template #action>
            <Button variant="outline" size="sm" @click="url.set({ q: undefined, status: undefined })">{{ t('web.common.clearFilters') }}</Button>
          </template>
        </EmptyState>
        <EmptyState v-else :icon="Workflow" :title="t('web.automations.emptyTitle')" :description="t('web.automations.emptyHelp')">
          <template v-if="can('automations:manage')" #action>
            <Button size="sm" @click="createOpen = true"><Plus />{{ t('web.automations.new') }}</Button>
          </template>
        </EmptyState>
      </template>
    </DataTable>
  </Page>

  <PromptDialog
    v-model:open="createOpen"
    :title="t('web.automations.new')"
    :label="t('globals.fields.name')"
    :confirm-label="t('globals.buttons.new')"
    :pending="create.isPending.value"
    @submit="doCreate"
  />

  <ConfirmDialog
    v-model:open="actOpen"
    :destructive="acting?.act === 'delete' || acting?.act === 'archive'"
    :title="actLabel"
    :description="acting ? (acting.act === 'archive' ? t('web.automations.archiveWarning') : acting.row.name) : ''"
    :confirm-label="actLabel"
    :pending="pending"
    @confirm="confirmAct"
  />
</template>
