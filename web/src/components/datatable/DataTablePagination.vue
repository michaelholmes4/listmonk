<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import type { PaginationState } from '@tanstack/vue-table'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const props = defineProps<{ total: number; pageSizes: number[] }>()
const state = defineModel<PaginationState>({ required: true })

const { t, n } = useI18n()

const pages = computed(() => Math.max(1, Math.ceil(props.total / state.value.pageSize)))
const page = computed(() => state.value.pageIndex + 1)

const go = (pageIndex: number) => (state.value = { ...state.value, pageIndex })
// Changing the page size resets to the first page, otherwise the index can point past the end.
const setSize = (v: unknown) => (state.value = { pageIndex: 0, pageSize: Number(v) })
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
    <span class="text-muted-foreground tabular-nums">{{ t('web.table.total', { count: n(total) }) }}</span>
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="hidden text-muted-foreground sm:inline">{{ t('web.table.rows') }}</span>
        <Select :model-value="String(state.pageSize)" @update:model-value="setSize">
          <SelectTrigger size="sm" class="w-20"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="s in pageSizes" :key="s" :value="String(s)">{{ s }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <span class="text-muted-foreground tabular-nums">{{ t('web.table.page', { page, pages }) }}</span>
      <div class="flex gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          :disabled="page <= 1"
          :aria-label="t('web.table.previous')"
          @click="go(state.pageIndex - 1)"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          :disabled="page >= pages"
          :aria-label="t('web.table.next')"
          @click="go(state.pageIndex + 1)"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  </div>
</template>
