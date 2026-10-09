<script setup lang="ts">
import { TabsList } from 'reka-ui'
import { tabStripClass } from './tabs'

/**
 * The tabs of a record page (a subscriber's Profile · Subscriptions · Activity), drawn along the
 * bottom of the page header like an entry's PageTabs, so they stay in reach while the page scrolls.
 * Put it inside the view's `<Tabs>` with `RecordTab`s; it renders into Page's `#page-tabs`.
 */
defineProps<{ label?: string }>()
</script>

<template>
  <Teleport defer to="#page-tabs">
    <TabsList :aria-label="label" data-slot="page-tabs" :class="tabStripClass" data-cy="record-tabs">
      <slot />
    </TabsList>
  </Teleport>
</template>
