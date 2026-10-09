<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Page from '@/components/layout/Page.vue'
import { useConfig } from '@/composables/queries/useConfig'
import { useUrlState } from '@/composables/useUrlState'
import MediaBrowser from '@/features/media/MediaBrowser.vue'

const { t } = useI18n()
const { data: config } = useConfig()

// Search and page live in the URL so they survive reloads and back-navigation.
const url = useUrlState(['media'])
const search = computed({ get: () => (url.query.value.q as string) ?? '', set: (v) => url.set({ q: v || undefined, page: undefined }) })
const page = computed({ get: () => url.int('page', 1), set: (v) => url.set({ page: v === 1 ? undefined : v }) })
const total = ref(0)
</script>

<template>
  <Page :title="t('media.title')" :count="total || undefined">
    <template v-if="config?.media_provider" #meta>
      <span>{{ t('settings.media.provider') }}: {{ config.media_provider }}</span>
    </template>
    <MediaBrowser v-model:search="search" v-model:page="page" @total="total = $event" />
  </Page>
</template>
