<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PaginationState } from '@tanstack/vue-table'
import type { MessageLogRow } from '@/api/types'
import DataTable from '@/components/datatable/DataTable.vue'
import { useMessageLog } from '@/composables/queries/useMessageLog'
import { createColumns } from '@/features/messages/columns'

/** The emails sent to one subscriber, newest first (the same rows as Sent messages, filtered). */
const props = defineProps<{ subscriberId: number }>()
const { t } = useI18n()

const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 10 })
const { data, isPending } = useMessageLog(() => ({
  subscriberId: props.subscriberId,
  page: pagination.value.pageIndex + 1,
  perPage: pagination.value.pageSize,
  order: 'desc',
}))
const columns = createColumns({ t, showTo: false })
const total = computed(() => data.value?.total ?? 0)
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    :columns="columns"
    :data="data?.results ?? []"
    :row-count="total"
    :loading="isPending"
    :row-id="(m: MessageLogRow) => String(m.id)"
  >
    <template #empty><p class="py-6 text-center text-sm text-muted-foreground">{{ t('web.messages.emptyHelp') }}</p></template>
  </DataTable>
</template>
