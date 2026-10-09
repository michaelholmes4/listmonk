<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { NavPage } from '@/nav'

/**
 * Links between a sidebar entry's pages (Reports: Analytics · Sent messages · Bounces), drawn as
 * line tabs along the bottom of the page header. `Page` renders it; see `pages` in nav.ts.
 * Plain links with aria-current rather than a tablist: each tab is its own route.
 */
defineProps<{ label: string; pages: NavPage[]; active?: string }>()

const { t } = useI18n()
</script>

<template>
  <nav :aria-label="label" class="mt-4 flex gap-5 overflow-x-auto border-b" data-cy="page-tabs">
    <RouterLink v-for="p in pages" :key="p.key" v-slot="{ href, navigate }" :to="p.to" custom>
      <a
        :href="href"
        :aria-current="p.key === active ? 'page' : undefined"
        :data-cy="`pagetab-${p.key}`"
        class="-mb-px shrink-0 border-b-2 border-transparent pb-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
        @click="navigate"
      >
        {{ t(p.label) }}
      </a>
    </RouterLink>
  </nav>
</template>
