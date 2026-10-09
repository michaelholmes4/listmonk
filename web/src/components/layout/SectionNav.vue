<script setup lang="ts" generic="T extends string">
import { cn } from '@/lib/utils'

/**
 * Secondary navigation between the sections of one page (Settings): a vertical list on wide
 * screens, a scrolling row on narrow ones. `v-model` is the active section id.
 */
defineProps<{ items: { id: T; label: string; alert?: boolean; alertLabel?: string }[]; label: string }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <nav :aria-label="label" class="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
    <ul class="flex gap-1 md:flex-col" role="tablist" aria-orientation="vertical">
      <li v-for="item in items" :key="item.id" class="shrink-0">
        <button
          type="button"
          role="tab"
          :aria-selected="model === item.id"
          :data-state="model === item.id ? 'active' : 'inactive'"
          :data-cy="`tab-${item.id}`"
          :class="
            cn(
              'flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              model === item.id && 'bg-accent font-medium text-foreground',
            )
          "
          @click="model = item.id"
        >
          {{ item.label }}
          <span v-if="item.alert" class="size-1.5 rounded-full bg-destructive" :aria-label="item.alertLabel" />
        </button>
      </li>
    </ul>
  </nav>
</template>
