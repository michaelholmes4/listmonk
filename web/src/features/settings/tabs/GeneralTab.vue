<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Separator } from '@/components/ui/separator'
import { useConfig } from '@/composables/queries/useConfig'
import SettingInput from '../fields/SettingInput.vue'
import SettingSelect from '../fields/SettingSelect.vue'
import SettingSwitch from '../fields/SettingSwitch.vue'
import SettingTags from '../fields/SettingTags.vue'

const { t } = useI18n()
const { data: config } = useConfig()
const langs = computed(() => (config.value?.langs ?? []).map((l) => ({ value: l.code ?? '', label: l.name ?? '' })))
const looksLikeEmail = (v: string) => /.+@.+/.test(v)
</script>

<template>
  <div class="space-y-6">
    <SettingInput name="app.site_name" :label="t('settings.general.siteName')" />
    <SettingInput
      name="app.root_url"
      type="url"
      :label="t('settings.general.rootURL')"
      :help="t('settings.general.rootURLHelp')"
      placeholder="https://listmonk.yoursite.com"
    />
    <SettingInput
      name="app.logo_url"
      type="url"
      :label="t('settings.general.logoURL')"
      :help="t('settings.general.logoURLHelp')"
      placeholder="https://listmonk.yoursite.com/logo.png"
    />
    <SettingInput
      name="app.favicon_url"
      type="url"
      :label="t('settings.general.faviconURL')"
      :help="t('settings.general.faviconURLHelp')"
      placeholder="https://listmonk.yoursite.com/favicon.png"
    />

    <Separator />

    <SettingInput
      name="app.from_email"
      :label="t('settings.general.fromEmail')"
      :help="t('settings.general.fromEmailHelp')"
      placeholder="Listmonk <noreply@listmonk.yoursite.com>"
    />
    <SettingTags
      name="app.notify_emails"
      :label="t('settings.general.adminNotifEmails')"
      :help="t('settings.general.adminNotifEmailsHelp')"
      placeholder="you@yoursite.com"
      :accept="looksLikeEmail"
    />

    <Separator />

    <section class="space-y-4">
      <h2 class="text-base font-semibold">{{ t('globals.terms.subscriptions', 2) }}</h2>
      <SettingSwitch
        name="app.enable_public_subscription_page"
        :label="t('settings.general.enablePublicSubPage')"
        :help="t('settings.general.enablePublicSubPageHelp')"
      />
      <SettingSwitch
        name="app.send_optin_confirmation"
        :label="t('settings.general.sendOptinConfirm')"
        :help="t('settings.general.sendOptinConfirmHelp')"
      />
      <SettingSwitch name="app.show_optin_page" :label="t('settings.general.showOptinPage')" :help="t('settings.general.showOptinPageHelp')" />
    </section>

    <Separator />

    <section class="space-y-4">
      <h2 class="text-base font-semibold">{{ t('campaigns.archive') }}</h2>
      <SettingSwitch
        name="app.enable_public_archive"
        :label="t('settings.general.enablePublicArchive')"
        :help="t('settings.general.enablePublicArchiveHelp')"
      />
      <SettingSwitch
        name="app.enable_public_archive_rss_content"
        :label="t('settings.general.enablePublicArchiveRSSContent')"
        :help="t('settings.general.enablePublicArchiveRSSContentHelp')"
      />
    </section>

    <Separator />

    <SettingSwitch name="app.check_updates" :label="t('settings.general.checkUpdates')" :help="t('settings.general.checkUpdatesHelp')" />

    <Separator />

    <div class="max-w-xs space-y-2">
      <SettingSelect name="app.lang" :label="t('settings.general.language')" :options="langs" />
      <a href="https://listmonk.app/docs/i18n/#additional-language-packs" target="_blank" rel="noopener noreferrer" class="link-style text-sm">
        {{ t('globals.buttons.more') }} &rarr;
      </a>
    </div>
  </div>
</template>
