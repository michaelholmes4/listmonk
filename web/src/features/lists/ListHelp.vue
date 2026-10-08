<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <p>{{ t('web.lists.help.what') }}</p>
  <p>{{ t('web.lists.help.private') }}</p>
  <p>{{ t('web.lists.help.archive') }}</p>
  <a href="https://listmonk.app/docs/concepts/#lists" target="_blank" rel="noopener noreferrer" class="link-style">
    {{ t('web.common.learnMore') }}
  </a>
</template>
