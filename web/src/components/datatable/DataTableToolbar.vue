<script setup lang="ts">
import { X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'

/**
 * The bar above a table: search and filters on the left (default slot), page-level secondary
 * actions such as Export on the right (`end`). While rows are selected it becomes the bulk
 * action bar instead: "N selected · Select all N", the `bulk` actions, and Clear. One layout
 * for every list page, in the same place.
 */
withDefaults(defineProps<{ selected?: number; total?: number; canSelectAll?: boolean }>(), {
  selected: 0,
  total: 0,
  canSelectAll: false,
})
const emit = defineEmits<{ selectAll: []; clear: [] }>()
const { t, n } = useI18n()
</script>

<template>
  <div class="flex min-h-9 flex-wrap items-center gap-2" data-cy="table-toolbar">
    <div
      v-if="selected > 0 && $slots.bulk"
      class="flex min-h-9 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted px-3 py-1 text-sm"
      data-cy="bulk-bar"
    >
      <span class="font-medium tabular-nums">{{ t('globals.messages.numSelected', { num: n(selected) }) }}</span>
      <Button v-if="canSelectAll" variant="link" size="sm" class="h-auto px-0" @click="emit('selectAll')">
        {{ t('globals.messages.selectAll', { num: n(total) }) }}
      </Button>
      <span class="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
      <div class="flex flex-wrap items-center gap-1"><slot name="bulk" /></div>
      <Button variant="ghost" size="sm" class="ml-auto" @click="emit('clear')"><X />{{ t('globals.buttons.clear') }}</Button>
    </div>
    <template v-else>
      <div class="flex flex-1 flex-wrap items-center gap-2"><slot /></div>
      <div v-if="$slots.end" class="flex items-center gap-2"><slot name="end" /></div>
    </template>
  </div>
</template>
