<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfig } from '@/composables/queries/useConfig'
import { useUrlState } from '@/composables/useUrlState'
import MediaBrowser from '@/features/media/MediaBrowser.vue'

const { t, n } = useI18n()
const { data: config } = useConfig()

// Search and page live in the URL so they survive reloads and back-navigation.
const url = useUrlState(['media'])
const search = computed({ get: () => (url.query.value.q as string) ?? '', set: (v) => url.set({ q: v || undefined, page: undefined }) })
const page = computed({ get: () => url.int('page', 1), set: (v) => url.set({ page: v === 1 ? undefined : v }) })
const total = ref(0)
</script>

<template>
  <div class="space-y-6 p-6">
    <h1 class="text-xl font-semibold">
      {{ t('media.title') }}
      <span v-if="total" class="text-muted-foreground tabular-nums">({{ n(total) }})</span>
      <span v-if="config?.media_provider" class="font-normal text-muted-foreground"> / {{ config.media_provider }}</span>
    </h1>
    <MediaBrowser v-model:search="search" v-model:page="page" @total="total = $event" />
  </div>
</template>
