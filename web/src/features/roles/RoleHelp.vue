<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ kind: 'user' | 'list' }>()
const { t } = useI18n()
</script>

<template>
  <p>{{ kind === 'user' ? t('web.roles.help.user') : t('web.roles.help.list') }}</p>
  <a href="https://listmonk.app/docs/roles-and-permissions/" target="_blank" rel="noopener noreferrer" class="link-style">
    {{ t('web.common.learnMore') }}
  </a>
</template>
