<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <p>{{ t('web.subscribers.help.what') }}</p>
  <p>{{ t('web.subscribers.help.blocklist') }}</p>
  <p>{{ t('web.subscribers.help.attribs') }}</p>
  <a href="https://listmonk.app/docs/concepts/#subscribers" target="_blank" rel="noopener noreferrer" class="link-style">
    {{ t('web.common.learnMore') }}
  </a>
</template>
