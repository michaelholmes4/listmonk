<script setup lang="ts">
import { Search } from '@lucide/vue'
import type { ColumnDef, PaginationState } from '@tanstack/vue-table'
import { format } from 'date-fns'
import { computed, h, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { AutomationEnrollment, EnrollmentStatus } from '@/api/types'
import DataTable from '@/components/datatable/DataTable.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useEnrollments, useEnrollmentSteps } from '@/composables/queries/useAutomations'
import StepLog from './StepLog.vue'
import { enrollmentStatuses, enrollmentVariant } from './status'

/** Who is in the automation (or has been), with a log of what happened to each. */
const props = defineProps<{ automationId: number }>()
const { t, n, te } = useI18n()

const ALL = '__all'
const status = ref<EnrollmentStatus | typeof ALL>(ALL)
const search = ref('')
const searchInput = ref('')
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 20 })
watch([status, search], () => (pagination.value = { ...pagination.value, pageIndex: 0 }))

const query = computed(() => ({
  status: status.value === ALL ? undefined : [status.value],
  query: search.value,
  page: pagination.value.pageIndex + 1,
  perPage: pagination.value.pageSize,
}))
const { data, isPending } = useEnrollments(() => props.automationId, query)

const selected = ref<AutomationEnrollment | null>(null)
const sheetOpen = computed({ get: () => !!selected.value, set: (o) => !o && (selected.value = null) })
const { data: steps, isPending: stepsPending } = useEnrollmentSteps(() => props.automationId, () => selected.value?.id)

const stamp = (iso?: string | null) => (iso ? format(new Date(iso), 'PP p') : '')

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
const columns: ColumnDef<any, AutomationEnrollment>[] = [
  {
    id: 'status',
    header: () => t('globals.fields.status'),
    enableSorting: false,
    cell: ({ row }) => h(Badge, { variant: enrollmentVariant(row.original.status) }, () => t(`web.automations.enrollment.${row.original.status}`)),
  },
  {
    id: 'subscriber',
    header: () => t('globals.terms.subscriber', 1),
    enableSorting: false,
    cell: ({ row }) =>
      h('div', { class: 'space-y-0.5' }, [
        h(RouterLink, { to: { name: 'subscriber', params: { id: row.original.subscriber_id } }, class: 'font-medium hover:underline' }, () => row.original.email),
        row.original.subscriber_name ? h('p', { class: 'text-xs text-muted-foreground' }, row.original.subscriber_name) : null,
      ]),
  },
  {
    id: 'where',
    header: () => t('web.automations.where'),
    enableSorting: false,
    cell: ({ row }) => {
      const e = row.original
      if (e.status === 'waiting' && e.next_run_at) return t('web.automations.waitingUntil', { when: stamp(e.next_run_at) })
      if (e.exit_reason) return te(`web.automations.exitReason.${e.exit_reason}`) ? t(`web.automations.exitReason.${e.exit_reason}`) : e.exit_reason
      return e.current_node_id ?? ''
    },
  },
  { id: 'entered', header: () => t('web.automations.entered_at'), enableSorting: false, cell: ({ row }) => stamp(row.original.entered_at) },
  {
    id: 'log',
    header: () => '',
    enableSorting: false,
    cell: ({ row }) => h(Button, { variant: 'ghost', size: 'sm', onClick: () => (selected.value = row.original) }, () => t('web.automations.log')),
  },
]
</script>

<template>
  <div class="space-y-4" data-cy="enrollments">
    <div class="flex flex-wrap items-center gap-2">
      <form class="relative min-w-64 max-w-sm flex-1" @submit.prevent="search = searchInput.trim()">
        <Search class="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input v-model="searchInput" class="pl-8" :placeholder="t('web.automations.searchPeople')" :aria-label="t('web.automations.searchPeople')" />
      </form>
      <Select v-model="status">
        <SelectTrigger size="sm" class="w-44" :aria-label="t('globals.fields.status')"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL">{{ t('globals.fields.status') }}: {{ t('web.common.all') }}</SelectItem>
          <SelectItem v-for="s in enrollmentStatuses" :key="s" :value="s">{{ t(`web.automations.enrollment.${s}`) }}</SelectItem>
        </SelectContent>
      </Select>
      <span v-if="data" class="text-sm text-muted-foreground tabular-nums">{{ t('web.table.total', { count: n(data.total) }) }}</span>
    </div>

    <DataTable
      v-model:pagination="pagination"
      :columns="columns"
      :data="data?.results ?? []"
      :row-count="data?.total ?? 0"
      :loading="isPending"
      :row-id="(e: AutomationEnrollment) => String(e.id)"
    />

    <Sheet v-model:open="sheetOpen">
      <SheetContent class="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{{ selected?.email }}</SheetTitle>
          <SheetDescription>{{ t('web.automations.logHelp') }}</SheetDescription>
        </SheetHeader>
        <div class="px-4 pb-4">
          <div v-if="stepsPending" class="space-y-2"><Skeleton class="h-10 w-full" /><Skeleton class="h-10 w-full" /></div>
          <StepLog v-else :steps="steps ?? []" :enrollment="selected" />
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>
