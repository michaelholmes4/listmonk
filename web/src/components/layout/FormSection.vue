<script setup lang="ts">
/**
 * A titled group of related fields inside a form ("Sender", "Audience", "Schedule"...). Sections are
 * separated by a rule; the first one has none.
 *
 * Where the page is wide enough (Page's content is a size container), the title and description sit
 * in a column left of the fields, as in GitHub's and Polaris' settings; narrower, they stack above.
 * Either way the fields column is capped at a readable width, so inputs never stretch across the page.
 */
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <section class="grid max-w-xl gap-x-10 gap-y-4 border-t pt-8 first:border-t-0 first:pt-0 @3xl:max-w-210 @3xl:grid-cols-[14rem_minmax(0,36rem)]">
    <header class="space-y-1">
      <h2 class="text-base font-semibold @3xl:text-sm">{{ title }}</h2>
      <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
    </header>
    <div class="min-w-0 space-y-6"><slot /></div>
  </section>
</template>
