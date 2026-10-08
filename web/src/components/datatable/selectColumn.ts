import type { ColumnDef, RowData } from '@tanstack/vue-table'
import { h } from 'vue'
import { Checkbox } from '@/components/ui/checkbox'

/**
 * The checkbox column for tables with row selection. Pair it with `v-model:selection` and a
 * `row-id` on DataTable. `label` is the accessible name of the header checkbox; `rowLabel`
 * names each row's checkbox.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches DataTable's `columns` prop
export function selectColumn<TData extends RowData>(label: string, rowLabel: (row: TData) => string): ColumnDef<any, TData> {
  return {
    id: 'select',
    enableSorting: false,
    header: ({ table }) =>
      h(Checkbox, {
        'modelValue': table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false,
        'onUpdate:modelValue': (v: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(v === true),
        'aria-label': label,
      }),
    cell: ({ row }) =>
      h(Checkbox, {
        'modelValue': row.getIsSelected(),
        'onUpdate:modelValue': (v: boolean | 'indeterminate') => row.toggleSelected(v === true),
        'aria-label': rowLabel(row.original as TData),
      }),
  }
}
