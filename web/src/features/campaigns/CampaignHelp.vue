<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <p>{{ t('web.campaigns.help.what') }}</p>
  <p>{{ t('web.campaigns.help.content') }}</p>
  <p>{{ t('web.campaigns.help.lock') }}</p>
  <a href="https://listmonk.app/docs/concepts/#campaigns" target="_blank" rel="noopener noreferrer" class="link-style">
    {{ t('web.common.learnMore') }}
  </a>
</template>
