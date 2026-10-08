<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
    <h1 class="text-xl font-semibold">{{ t('web.errors.notFoundTitle') }}</h1>
    <p class="text-sm text-muted-foreground">{{ t('web.errors.notFoundBody') }}</p>
    <Button as-child>
      <RouterLink :to="{ name: 'dashboard' }">{{ t('web.errors.goHome') }}</RouterLink>
    </Button>
  </div>
</template>
