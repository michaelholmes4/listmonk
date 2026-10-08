<script setup lang="ts">
// Settings-style pages: the form on the left, a help column on the right.
// Use the `help` slot for explanatory text; it stacks below the content on narrow screens.
</script>

<template>
  <div class="mx-auto grid w-full max-w-6xl gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <div class="min-w-0 space-y-6">
      <slot />
    </div>
    <aside class="text-sm text-muted-foreground lg:sticky lg:top-6 lg:self-start">
      <slot name="help" />
    </aside>
  </div>
</template>
