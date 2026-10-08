<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AdminSplitLayout from '@/components/layout/AdminSplitLayout.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfig } from '@/composables/queries/useConfig'
import { useSettings } from '@/composables/queries/useSettings'
import SettingsForm from '@/features/settings/SettingsForm.vue'
import SettingsHelp from '@/features/settings/SettingsHelp.vue'
import type { SettingsTab } from '@/features/settings/tabIds'

const { t } = useI18n()
const { data: settings } = useSettings()
const { data: config } = useConfig()
const tab = ref<SettingsTab>('general')
</script>

<template>
  <AdminSplitLayout>
    <header class="mb-6">
      <h1 class="text-xl font-semibold">
        {{ t('settings.title') }}
        <span v-if="config?.version" class="font-normal text-muted-foreground">({{ config.version }})</span>
      </h1>
    </header>

    <div v-if="!settings" class="space-y-4">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>
    <SettingsForm v-else :settings="settings" @tab="tab = $event" />

    <template #help><SettingsHelp :tab="tab" /></template>
  </AdminSplitLayout>
</template>
