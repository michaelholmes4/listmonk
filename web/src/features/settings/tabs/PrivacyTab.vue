<script setup lang="ts">
import { useFormContext } from 'vee-validate'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import SettingSwitch from '../fields/SettingSwitch.vue'
import SettingText from '../fields/SettingText.vue'
import type { SettingsForm } from '../schema'

const { t } = useI18n()
const { values } = useFormContext<SettingsForm>()
const count = (s?: string) => (s ?? '').split('\n').filter((l) => l.trim()).length
const blocked = computed(() => count(values.privacy?.domain_blocklist))
const allowed = computed(() => count(values.privacy?.domain_allowlist))
</script>

<template>
  <div class="space-y-6">
    <SettingSwitch name="privacy.disable_tracking" :label="t('settings.privacy.disableTracking')" :help="t('settings.privacy.disableTrackingHelp')" />
    <SettingSwitch
      name="privacy.individual_tracking"
      :label="t('settings.privacy.individualSubTracking')"
      :help="t('settings.privacy.individualSubTrackingHelp')"
      :disabled="values.privacy?.disable_tracking"
    />
    <SettingSwitch name="privacy.unsubscribe_header" :label="t('settings.privacy.listUnsubHeader')" :help="t('settings.privacy.listUnsubHeaderHelp')" />
    <SettingSwitch name="privacy.allow_blocklist" :label="t('settings.privacy.allowBlocklist')" :help="t('settings.privacy.allowBlocklistHelp')" />
    <SettingSwitch name="privacy.allow_preferences" :label="t('settings.privacy.allowPrefs')" :help="t('settings.privacy.allowPrefsHelp')" />
    <SettingSwitch name="privacy.allow_export" :label="t('settings.privacy.allowExport')" :help="t('settings.privacy.allowExportHelp')" />
    <SettingSwitch name="privacy.allow_wipe" :label="t('settings.privacy.allowWipe')" :help="t('settings.privacy.allowWipeHelp')" />
    <SettingSwitch name="privacy.record_optin_ip" :label="t('settings.privacy.recordOptinIP')" :help="t('settings.privacy.recordOptinIPHelp')" />

    <Separator />

    <Tabs default-value="blocklist">
      <TabsList>
        <TabsTrigger value="blocklist">{{ t('settings.privacy.domainBlocklist') }} ({{ blocked }})</TabsTrigger>
        <TabsTrigger value="allowlist">{{ t('settings.privacy.domainAllowlist') }} ({{ allowed }})</TabsTrigger>
      </TabsList>
      <TabsContent value="blocklist" class="pt-3">
        <SettingText name="privacy.domain_blocklist" :help="t('settings.privacy.domainBlocklistHelp')" placeholder="spam.example.com" />
      </TabsContent>
      <TabsContent value="allowlist" class="pt-3">
        <SettingText name="privacy.domain_allowlist" :help="t('settings.privacy.domainAllowlistHelp')" placeholder="example.com" />
      </TabsContent>
    </Tabs>
  </div>
</template>
