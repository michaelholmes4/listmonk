<script setup lang="ts">
import { Plus, Search } from '@lucide/vue'
import type { PaginationState, SortingState } from '@tanstack/vue-table'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { AutomationQuery } from '@/api/automations'
import type { AutomationRow, AutomationStatus } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DataTable from '@/components/datatable/DataTable.vue'
import PromptDialog from '@/components/PromptDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useArchiveAutomation,
  useAutomations,
  useCreateAutomation,
  useDeleteAutomation,
  usePauseAutomation,
  useResumeAutomation,
} from '@/composables/queries/useAutomations'
import { usePermission } from '@/composables/usePermission'
import { useUrlState } from '@/composables/useUrlState'
import { createColumns } from '@/features/automations/columns'
import { automationStatuses } from '@/features/automations/status'

const { t, n } = useI18n()
const router = useRouter()
const { can } = usePermission()

// --- URL state: search, status, page and sort. ---------------------------------------------------------
const url = useUrlState(['automations'])
const urlSearch = url.str('q')
const searchInput = ref(urlSearch.value)
const ALL = '__all'
const status = computed(() => {
  const s = url.query.value.status as AutomationStatus | undefined
  return s && automationStatuses.includes(s) ? s : undefined
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

const filter = computed(() => ({ query: urlSearch.value, status: status.value }))
const query = computed<AutomationQuery>(() => ({
  query: urlSearch.value,
  status: status.value ? [status.value] : undefined,
  page: pagination.value.pageIndex + 1,
  perPage: pagination.value.pageSize,
  orderBy: sorting.value[0]?.id as AutomationQuery['orderBy'],
  order: sorting.value[0] ? (sorting.value[0].desc ? 'desc' : 'asc') : 'desc',
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
  <Teleport defer to="#page-actions">
    <Button v-if="can('automations:manage')" size="sm" data-cy="btn-new" @click="createOpen = true">
      <Plus />{{ t('globals.buttons.new') }}
    </Button>
  </Teleport>

  <div class="space-y-4 p-6">
    <h1 class="text-xl font-semibold">
      {{ t('web.automations.title') }}
      <span v-if="data" class="text-muted-foreground tabular-nums">({{ n(total) }})</span>
    </h1>

    <div class="flex flex-wrap items-center gap-2">
      <form class="relative min-w-64 max-w-sm flex-1" @submit.prevent="urlSearch = searchInput.trim()">
        <Search class="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input v-model="searchInput" class="pl-8" :placeholder="t('web.automations.search')" :aria-label="t('web.automations.search')" />
      </form>
      <Select :model-value="status ?? ALL" @update:model-value="url.set({ status: $event === ALL ? undefined : String($event) })">
        <SelectTrigger size="sm" class="w-40" :aria-label="t('globals.fields.status')"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL">{{ t('globals.fields.status') }}: {{ t('web.common.all') }}</SelectItem>
          <SelectItem v-for="s in automationStatuses" :key="s" :value="s">{{ t(`web.automations.status.${s}`) }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <DataTable
      v-model:pagination="pagination"
      v-model:sorting="sorting"
      :columns="columns"
      :data="data?.results ?? []"
      :row-count="total"
      :loading="isPending"
      :row-id="(a: AutomationRow) => String(a.id)"
    />
  </div>

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
