<script setup lang="ts">
/**
 * A titled group of related fields inside a form ("Sender", "Audience", "Schedule"...). Sections
 * are separated by a rule; the first one has none.
 */
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <section class="space-y-4 border-t pt-6 first:border-t-0 first:pt-0">
    <header class="space-y-0.5">
      <h2 class="text-base font-semibold">{{ title }}</h2>
      <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
    </header>
    <div class="space-y-6"><slot /></div>
  </section>
</template>
