<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Page from '@/components/layout/Page.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfig } from '@/composables/queries/useConfig'
import { useSettings } from '@/composables/queries/useSettings'
import SettingsForm from '@/features/settings/SettingsForm.vue'

const { t } = useI18n()
const { data: settings } = useSettings()
const { data: config } = useConfig()
</script>

<template>
  <Page :title="t('settings.title')">
    <template v-if="config?.version" #badges>
      <span class="text-sm font-normal text-muted-foreground">{{ config.version }}</span>
    </template>

    <div v-if="!settings" class="grid grid-cols-1 gap-10 md:grid-cols-[11rem_minmax(0,1fr)]">
      <div class="space-y-2"><Skeleton v-for="i in 6" :key="i" class="h-7 w-full" /></div>
      <div class="max-w-3xl space-y-4">
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-64 w-full" />
      </div>
    </div>
    <SettingsForm v-else :settings="settings" />
  </Page>
</template>
