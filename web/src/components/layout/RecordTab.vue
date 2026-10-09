<script setup lang="ts">
import { TabsTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { cn } from '@/lib/utils'
import { tabClass } from './tabs'

/** One of a record page's tabs (see RecordTabs). `count` shows as a small counter after the label. */
defineProps<{ value: string; count?: number }>()
const { n } = useI18n()
</script>

<template>
  <TabsTrigger :value="value" :class="cn(tabClass, 'data-[state=active]:border-foreground data-[state=active]:text-foreground')">
    <slot />
    <span v-if="count !== undefined" class="rounded-full bg-muted px-1.5 text-xs leading-5 tabular-nums" data-cy="tab-count">{{ n(count) }}</span>
  </TabsTrigger>
</template>
