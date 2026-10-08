<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Label } from '@/components/ui/label'
import type { Config } from '../model'
import DurationInput from './DurationInput.vue'

defineProps<{ errors: Record<string, string>; disabled?: boolean }>()
const config = defineModel<Config>({ required: true })
const { t } = useI18n()
const set = (v: string) => (config.value = { ...config.value, duration: v })
</script>

<template>
  <div class="space-y-2">
    <Label for="delay-duration">{{ t('web.automations.delay.wait') }}</Label>
    <DurationInput
      id="delay-duration"
      :model-value="String(config.duration ?? '')"
      :invalid="!!errors.duration"
      :disabled="disabled"
      @update:model-value="set"
    />
    <p v-if="errors.duration" class="text-sm text-destructive">{{ errors.duration }}</p>
    <p class="text-xs text-muted-foreground">{{ t('web.automations.delay.help') }}</p>
  </div>
</template>
