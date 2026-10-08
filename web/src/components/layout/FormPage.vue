<script setup lang="ts">
import AdminSplitLayout from './AdminSplitLayout.vue'

// Frame for create/edit pages: title row (optional badges and meta) above the form, help rail on
// the right (`help` slot). The form itself sits on the page background, no card.
defineProps<{ title: string }>()
</script>

<template>
  <AdminSplitLayout>
    <header class="mb-6 space-y-1">
      <h1 class="flex flex-wrap items-center gap-2 text-xl font-semibold">
        {{ title }}
        <slot name="badges" />
      </h1>
      <div class="flex flex-wrap gap-x-4 text-xs text-muted-foreground"><slot name="meta" /></div>
    </header>
    <slot />
    <template #help><slot name="help" /></template>
  </AdminSplitLayout>
</template>
