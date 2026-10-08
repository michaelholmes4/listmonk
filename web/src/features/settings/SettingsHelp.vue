<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { SettingsTab } from './tabIds'

defineProps<{ tab: SettingsTab }>()
const { t } = useI18n()
</script>

<template>
  <p>{{ t(`web.settings.help.${tab}`) }}</p>
  <p>{{ t('web.settings.saveHint') }}</p>
</template>
