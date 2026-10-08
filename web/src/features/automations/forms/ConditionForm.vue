<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useSettings } from '@/composables/queries/useSettings'
import { usePermission } from '@/composables/usePermission'
import type { Config, Step } from '../model'
import { usesEngagement, type Rule } from '../rule'
import RuleEditor from './RuleEditor.vue'

defineProps<{ emailSteps: Step[]; errors: Record<string, string>; disabled?: boolean }>()
const config = defineModel<Config>({ required: true })
const { t } = useI18n()
const { can } = usePermission()
// Only readable with settings:get; without it the warning is simply not shown.
const { data: settings } = useSettings({ enabled: can('settings:get') })

const rule = () => (config.value.rule ?? { op: 'and', rules: [] }) as Rule
// Opened/clicked are recorded per subscriber only when individual tracking is on.
const tracking = () => settings.value?.['privacy.individual_tracking']
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted-foreground">{{ t('web.automations.condition.help') }}</p>
    <Alert v-if="usesEngagement(rule()) && tracking() === false" data-cy="tracking-warning">
      <AlertDescription>{{ t('web.automations.condition.trackingOff') }}</AlertDescription>
    </Alert>
    <RuleEditor
      :model-value="rule()"
      :email-steps="emailSteps"
      :allow-sql="can('subscribers:sql_query')"
      :errors="errors"
      :disabled="disabled"
      @update:model-value="config = { ...config, rule: $event }"
    />
  </div>
</template>
