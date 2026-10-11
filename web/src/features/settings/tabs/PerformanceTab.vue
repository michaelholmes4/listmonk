<script setup lang="ts">
import { useFormContext } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import FormSection from '@/components/layout/FormSection.vue'
import SettingInput from '../fields/SettingInput.vue'
import SettingNumber from '../fields/SettingNumber.vue'
import SettingSwitch from '../fields/SettingSwitch.vue'
import type { SettingsForm } from '../schema'

const { t } = useI18n()
const { values } = useFormContext<SettingsForm>()
</script>

<template>
  <div class="space-y-8">
    <FormSection
      :title="t('web.settings.performance.sending')"
      :description="t('web.settings.performance.sendingHelp')"
    >
      <SettingNumber
        name="app.concurrency"
        :label="t('settings.performance.concurrency')"
        :help="t('settings.performance.concurrencyHelp')"
        :min="1"
        :max="10000"
        placeholder="5"
      />
      <SettingNumber
        name="app.message_rate"
        :label="t('settings.performance.messageRate')"
        :help="t('settings.performance.messageRateHelp')"
        :min="1"
        :max="100000"
        placeholder="5"
      />
      <SettingNumber
        name="app.batch_size"
        :label="t('settings.performance.batchSize')"
        :help="t('settings.performance.batchSizeHelp')"
        :min="1"
        :max="100000"
        placeholder="1000"
      />
      <SettingNumber
        name="app.max_send_errors"
        :label="t('settings.performance.maxErrThreshold')"
        :help="t('settings.performance.maxErrThresholdHelp')"
        :min="0"
        :max="100000"
        placeholder="1999"
      />
    </FormSection>

    <FormSection
      :title="t('web.settings.performance.window')"
      :description="t('settings.performance.slidingWindowHelp')"
    >
      <SettingSwitch name="app.message_sliding_window" :label="t('settings.performance.slidingWindow')" />
      <SettingNumber
        name="app.message_sliding_window_rate"
        :label="t('settings.performance.slidingWindowRate')"
        :help="t('settings.performance.slidingWindowRateHelp')"
        :min="1"
        :max="10000000"
        placeholder="25"
        :disabled="!values.app?.message_sliding_window"
      />
      <SettingInput
        name="app.message_sliding_window_duration"
        :label="t('settings.performance.slidingWindowDuration')"
        :help="t('settings.performance.slidingWindowDurationHelp')"
        placeholder="1h"
        :maxlength="10"
        short
        :disabled="!values.app?.message_sliding_window"
      />
    </FormSection>

    <FormSection
      :title="t('web.settings.performance.cache')"
      :description="t('settings.performance.cacheSlowQueriesHelp')"
    >
      <SettingSwitch name="app.cache_slow_queries" :label="t('settings.performance.cacheSlowQueries')" />
      <SettingInput
        name="app.cache_slow_queries_interval"
        :label="t('settings.maintenance.cron')"
        placeholder="0 3 * * *"
        short
        :disabled="!values.app?.cache_slow_queries"
      />
      <a
        href="https://listmonk.app/docs/maintenance/performance/"
        target="_blank"
        rel="noopener noreferrer"
        class="link-style text-sm"
      >
        {{ t('globals.buttons.learnMore') }} &rarr;
      </a>
    </FormSection>
  </div>
</template>
