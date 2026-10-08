<script setup lang="ts">
// Admin pages (settings, create/edit forms): content on the left, an explanatory help rail on the
// right. Not centred and not boxed, like libredesk's AdminSplitLayout; the rail hides below `lg`.
</script>

<template>
  <div class="flex justify-between p-6">
    <div class="w-full min-w-0 lg:pr-6 xl:w-8/12"><slot /></div>
    <aside class="hidden w-3/12 space-y-3 p-2 text-sm text-foreground/70 lg:block">
      <slot name="help" />
    </aside>
  </div>
</template>
