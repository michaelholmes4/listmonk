import type { PaginationState, RowSelectionState, SortingState } from '@tanstack/vue-table'
import { computed, reactive, ref, watch, type Ref, type WatchSource } from 'vue'
import type { useUrlState } from './useUrlState'

type UrlState = ReturnType<typeof useUrlState>

/**
 * Page and sort for a server-paginated table, kept in the URL (`page`, `size`, `sort=field:asc|desc`)
 * so they survive a reload and the trip to a detail page and back.
 */
export function useUrlTable(url: UrlState, defaultSize = 20) {
  const pagination = computed<PaginationState>({
    get: () => ({ pageIndex: url.int('page', 1) - 1, pageSize: url.int('size', defaultSize) }),
    set: (v) => url.set({ page: v.pageIndex === 0 ? undefined : v.pageIndex + 1, size: v.pageSize === defaultSize ? undefined : v.pageSize }),
  })
  const sorting = computed<SortingState>({
    get: () => {
      const [id, dir] = ((url.query.value.sort as string) ?? '').split(':')
      return id ? [{ id, desc: dir === 'desc' }] : []
    },
    set: (v) => url.set({ sort: v[0] ? `${v[0].id}:${v[0].desc ? 'desc' : 'asc'}` : undefined, page: undefined }),
  })
  /** Query params for the API: 1-based page, and the sort (or `defaultOrder` when unsorted). */
  const apiPage = <O extends string>(defaultOrder?: 'asc' | 'desc') => ({
    page: pagination.value.pageIndex + 1,
    perPage: pagination.value.pageSize,
    orderBy: sorting.value[0]?.id as O | undefined,
    order: sorting.value[0] ? (sorting.value[0].desc ? ('desc' as const) : ('asc' as const)) : defaultOrder,
  })
  return { pagination, sorting, apiPage }
}

/**
 * Row selection that can grow from "the ticked rows" to "every row matching the filter"
 * (Gmail-style "select all N"). A filter change resets it and goes back to page 1.
 */
export function useRowSelection(opts: {
  total: Ref<number>
  /** Rows on the current page; unticking one of them leaves "select all" mode. */
  pageRows: Ref<number>
  filter: WatchSource
  onFilterChange?: () => void
}) {
  const selection = ref<RowSelectionState>({})
  const selectAll = ref(false)
  const clear = () => {
    selection.value = {}
    selectAll.value = false
  }
  watch(opts.filter, () => {
    opts.onFilterChange?.()
    clear()
  })
  watch(selection, () => {
    if (selectAll.value && Object.keys(selection.value).length < opts.pageRows.value) selectAll.value = false
  })

  const ids = computed(() => Object.keys(selection.value).map(Number))
  const count = computed(() => (selectAll.value ? opts.total.value : ids.value.length))
  const canSelectAll = computed(() => !selectAll.value && ids.value.length > 0 && opts.total.value > ids.value.length)
  return reactive({ selection, selectAll, ids, count, canSelectAll, clear })
}
