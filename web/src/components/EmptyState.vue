<script setup lang="ts">
import type { Component } from 'vue'

/** What to show instead of content that isn't there yet: why it's empty and what to do next (`action` slot). */
defineProps<{ icon?: Component; title: string; description?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center" data-cy="empty-state">
    <div v-if="icon" class="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <component :is="icon" class="size-5" />
    </div>
    <p class="font-medium">{{ title }}</p>
    <p v-if="description" class="max-w-sm text-sm text-muted-foreground">{{ description }}</p>
    <div v-if="$slots.action" class="mt-2 flex gap-2"><slot name="action" /></div>
  </div>
</template>
