<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <p>{{ t('web.users.help.what') }}</p>
  <p>{{ t('web.users.help.api') }}</p>
  <p>{{ t('web.users.help.roles') }}</p>
  <a href="https://listmonk.app/docs/roles-and-permissions/" target="_blank" rel="noopener noreferrer" class="link-style">
    {{ t('web.common.learnMore') }}
  </a>
</template>
