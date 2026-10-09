<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import Page from '@/components/layout/Page.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfig } from '@/composables/queries/useConfig'
import { useSettings } from '@/composables/queries/useSettings'
import SettingsForm from '@/features/settings/SettingsForm.vue'
import { tabLabels, tabOfQuery } from '@/features/settings/tabIds'

const { t } = useI18n()
const route = useRoute()
const { data: settings } = useSettings()
const { data: config } = useConfig()

// One page per section (the sidebar's Settings space links them): its name and help are the header.
const tab = computed(() => tabOfQuery(route.query.tab))
</script>

<template>
  <Page :title="t(tabLabels[tab])" :description="t(`web.settings.help.${tab}`)">
    <template v-if="tab === 'general' && config?.version" #badges>
      <span class="text-sm font-normal text-muted-foreground">{{ config.version }}</span>
    </template>

    <div v-if="!settings" class="max-w-3xl space-y-4">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>
    <SettingsForm v-else :settings="settings" />
  </Page>
</template>
