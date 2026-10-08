<script setup lang="ts" generic="TData extends RowData">
import {
  FlexRender,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from '@tanstack/vue-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from '@lucide/vue'
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
 *
 * Optional, both controlled by the parent and server-side:
 *   v-model:sorting   a column with `enableSorting` gets a clickable header
 *   v-model:selection ticked rows keyed by `rowId` (use a "select" column with a Checkbox)
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
    /** Stable row key; needed so a selection survives page changes. */
    rowId?: (row: TData) => string
    /** Set false for small lists that are loaded whole: hides the pager and shows every row. */
    paginated?: boolean
  }>(),
  {
    rowCount: undefined,
    loading: false,
    pageSizes: () => [20, 50, 100],
    emptyText: undefined,
    rowId: undefined,
    paginated: true,
  },
)

const pagination = defineModel<PaginationState>('pagination', { default: () => ({ pageIndex: 0, pageSize: 20 }) })

const sorting = defineModel<SortingState>('sorting', { default: () => [] })
const selection = defineModel<RowSelectionState>('selection', { default: () => ({}) })

const { t } = useI18n()

const features = tableFeatures({ rowPaginationFeature, rowSortingFeature, rowSelectionFeature })
const table = useTable({
  features,
  columns: props.columns,
  data: computed(() => props.data),
  rowCount: computed(() => props.rowCount ?? props.data.length),
  manualPagination: true,
  manualSorting: true,
  enableSortingRemoval: false,
  getRowId: props.rowId ? (row: TData) => props.rowId!(row) : undefined,
  state: computed(() => ({ pagination: pagination.value, sorting: sorting.value, rowSelection: selection.value })),
  onPaginationChange: (next: Updater<PaginationState>) => {
    pagination.value = typeof next === 'function' ? next(pagination.value) : next
  },
  onSortingChange: (next: Updater<SortingState>) => {
    sorting.value = typeof next === 'function' ? next(sorting.value) : next
  },
  onRowSelectionChange: (next: Updater<RowSelectionState>) => {
    selection.value = typeof next === 'function' ? next(selection.value) : next
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
              <template v-if="!header.isPlaceholder">
                <button
                  v-if="header.column.getCanSort()"
                  type="button"
                  class="-ml-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
                  @click="header.column.toggleSorting()"
                >
                  <FlexRender :header="header" />
                  <ArrowUp v-if="header.column.getIsSorted() === 'asc'" class="size-3.5" />
                  <ArrowDown v-else-if="header.column.getIsSorted() === 'desc'" class="size-3.5" />
                  <ArrowUpDown v-else class="size-3.5 opacity-40" />
                </button>
                <FlexRender v-else :header="header" />
              </template>
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
            <TableRow v-for="row in table.getRowModel().rows" :key="row.id" class="group/row" :data-state="row.getIsSelected() ? 'selected' : undefined">
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
    <DataTablePagination v-if="paginated" v-model="pagination" :total="rowCount ?? data.length" :page-sizes="pageSizes" />
  </div>
</template>
