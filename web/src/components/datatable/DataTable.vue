<script setup lang="ts" generic="TData extends RowData">
import {
  FlexRender,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowData,
  type Updater,
} from '@tanstack/vue-table'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DataTablePagination from './DataTablePagination.vue'

/**
 * Server-paginated table. The parent owns the data (a vue-query result) and the page state:
 *
 *   const pagination = ref({ pageIndex: 0, pageSize: 20 })
 *   const { data, isPending } = useQuery(() => ({ queryKey: [..., pagination.value], ..., placeholderData: keepPreviousData }))
 *   <DataTable v-model:pagination="pagination" :columns :data="data?.results ?? []" :row-count="data?.total" :loading="isPending" />
 *
 * Only the body shows skeleton rows while the first page loads; later page changes keep the
 * previous rows on screen (placeholderData) so the table never blanks.
 */
const props = withDefaults(
  defineProps<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columns: ColumnDef<any, TData>[]
    data: readonly TData[]
    rowCount?: number
    loading?: boolean
    pageSizes?: number[]
    /** Rendered in place of the rows when there are none. */
    emptyText?: string
  }>(),
  { rowCount: undefined, loading: false, pageSizes: () => [20, 50, 100], emptyText: undefined },
)

const pagination = defineModel<PaginationState>('pagination', { default: () => ({ pageIndex: 0, pageSize: 20 }) })

const { t } = useI18n()

const features = tableFeatures({ rowPaginationFeature })
const table = useTable({
  features,
  columns: props.columns,
  data: computed(() => props.data),
  rowCount: computed(() => props.rowCount ?? props.data.length),
  manualPagination: true,
  state: computed(() => ({ pagination: pagination.value })),
  onPaginationChange: (next: Updater<PaginationState>) => {
    pagination.value = typeof next === 'function' ? next(pagination.value) : next
  },
})

const colCount = computed(() => props.columns.length)
</script>

<template>
  <div class="space-y-3">
    <div class="box overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow v-for="group in table.getHeaderGroups()" :key="group.id">
            <TableHead v-for="header in group.headers" :key="header.id">
              <FlexRender v-if="!header.isPlaceholder" :header="header" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="loading">
            <TableRow v-for="i in pagination.pageSize > 10 ? 10 : pagination.pageSize" :key="i">
              <TableCell v-for="c in colCount" :key="c"><Skeleton class="h-4 w-full max-w-48" /></TableCell>
            </TableRow>
          </template>
          <template v-else-if="table.getRowModel().rows.length">
            <TableRow v-for="row in table.getRowModel().rows" :key="row.id" class="group/row">
              <TableCell v-for="cell in row.getAllCells()" :key="cell.id">
                <FlexRender :cell="cell" />
              </TableCell>
            </TableRow>
          </template>
          <TableRow v-else>
            <TableCell :colspan="colCount" class="h-24 text-center text-muted-foreground">
              {{ emptyText ?? t('web.table.empty') }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <DataTablePagination v-model="pagination" :total="rowCount ?? data.length" :page-sizes="pageSizes" />
  </div>
</template>
