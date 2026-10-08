<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSlowQueriesCached } from '@/composables/queries/useCacheNote'

/** Footnote for pages whose counts come from cached slow queries. */
const { t } = useI18n()
const cached = useSlowQueriesCached()
</script>

<template>
  <p v-if="cached" class="text-xs text-muted-foreground" data-cy="slow-queries-note">*{{ t('globals.messages.slowQueriesCached') }}</p>
</template>
