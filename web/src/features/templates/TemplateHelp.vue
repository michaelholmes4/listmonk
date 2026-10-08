<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <p>{{ t('web.templates.help.what') }}</p>
  <p>{{ t('web.templates.help.tx') }}</p>
  <a href="https://listmonk.app/docs/templating" target="_blank" rel="noopener noreferrer" class="link-style">
    {{ t('web.common.learnMore') }}
  </a>
</template>
