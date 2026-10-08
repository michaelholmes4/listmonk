<script setup lang="ts">
import { useFormContext } from 'vee-validate'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Separator } from '@/components/ui/separator'
import SettingInput from '../fields/SettingInput.vue'
import SettingNumber from '../fields/SettingNumber.vue'
import SettingSelect from '../fields/SettingSelect.vue'
import SettingSwitch from '../fields/SettingSwitch.vue'
import { bounceTypes, type SettingsForm } from '../schema'

const { t } = useI18n()
const { values } = useFormContext<SettingsForm>()

const on = computed(() => !!values.bounce?.enabled)
const hooks = computed(() => on.value && !!values.bounce?.webhooks_enabled)
const box = computed(() => values.bounce?.mailboxes?.[0])
const actionOptions = computed(() => [
  { value: 'none', label: t('globals.terms.none') },
  { value: 'unsubscribe', label: t('email.unsub') },
  { value: 'blocklist', label: t('settings.bounces.blocklist') },
  { value: 'delete', label: t('globals.buttons.delete') },
])
</script>

<template>
  <div class="space-y-6">
    <SettingSwitch name="bounce.enabled" :label="t('settings.bounces.enable')" />

    <section class="space-y-4" :class="!on && 'opacity-60'" data-cy="bounce-actions">
      <div v-for="typ in bounceTypes" :key="typ" class="grid items-start gap-4 md:grid-cols-[8rem_1fr_1fr]">
        <p class="pt-8 text-sm font-medium">{{ t(`bounces.${typ}`) }}</p>
        <SettingNumber
          :name="`bounce.actions.${typ}.count`"
          :label="t('settings.bounces.count')"
          :help="t('settings.bounces.countHelp')"
          :min="1"
          :max="1000"
          :disabled="!on"
        />
        <SettingSelect :name="`bounce.actions.${typ}.action`" :label="t('settings.bounces.action')" :options="actionOptions" :disabled="!on" />
      </div>
    </section>

    <Separator />

    <section class="space-y-4">
      <SettingSwitch name="bounce.webhooks_enabled" :label="t('settings.bounces.enableWebhooks')" :disabled="!on" />
      <a href="https://listmonk.app/docs/bounces" target="_blank" rel="noopener noreferrer" class="link-style text-sm">
        {{ t('globals.buttons.learnMore') }} &rarr;
      </a>

      <div v-if="hooks" class="space-y-6 rounded-lg border p-4" data-cy="bounce-webhooks">
        <SettingSwitch name="bounce.ses_enabled" :label="t('settings.bounces.enableSES')" />

        <div class="grid items-start gap-4 md:grid-cols-[12rem_1fr_1fr]">
          <SettingSwitch name="bounce.azure.enabled" :label="t('settings.bounces.enableAzure')" />
          <SettingInput
            name="bounce.azure.shared_secret"
            type="password"
            autocomplete="new-password"
            :label="t('settings.bounces.azureSharedSecret')"
            :help="t('settings.bounces.azureSharedSecretHelp')"
            :disabled="!values.bounce?.azure.enabled"
          />
          <SettingInput
            name="bounce.azure.shared_secret_header"
            :label="t('settings.bounces.azureSharedSecretHeader')"
            :help="t('settings.bounces.azureSharedSecretHeaderHelp')"
            :disabled="!values.bounce?.azure.enabled"
          />
        </div>

        <div class="grid items-start gap-4 md:grid-cols-[12rem_1fr]">
          <SettingSwitch name="bounce.sendgrid_enabled" :label="t('settings.bounces.enableSendgrid')" />
          <SettingInput
            name="bounce.sendgrid_key"
            type="password"
            autocomplete="new-password"
            :label="t('settings.bounces.sendgridKey')"
            :help="t('globals.messages.passwordChange')"
            :disabled="!values.bounce?.sendgrid_enabled"
          />
        </div>

        <div class="grid items-start gap-4 md:grid-cols-[12rem_1fr_1fr]">
          <SettingSwitch name="bounce.postmark.enabled" :label="t('settings.bounces.enablePostmark')" />
          <SettingInput
            name="bounce.postmark.username"
            :label="t('settings.bounces.postmarkUsername')"
            :help="t('settings.bounces.postmarkUsernameHelp')"
            :disabled="!values.bounce?.postmark.enabled"
          />
          <SettingInput
            name="bounce.postmark.password"
            type="password"
            autocomplete="new-password"
            :label="t('settings.bounces.postmarkPassword')"
            :help="t('globals.messages.passwordChange')"
            :disabled="!values.bounce?.postmark.enabled"
          />
        </div>

        <div class="grid items-start gap-4 md:grid-cols-[12rem_1fr]">
          <SettingSwitch name="bounce.forwardemail.enabled" :label="t('settings.bounces.enableForwardemail')" />
          <SettingInput
            name="bounce.forwardemail.key"
            type="password"
            autocomplete="new-password"
            :label="t('settings.bounces.forwardemailKey')"
            :help="t('globals.messages.passwordChange')"
            :disabled="!values.bounce?.forwardemail.enabled"
          />
        </div>

        <div class="grid items-start gap-4 md:grid-cols-[12rem_1fr]">
          <SettingSwitch name="bounce.lettermint.enabled" :label="t('settings.bounces.enableLettermint')" />
          <SettingInput
            name="bounce.lettermint.key"
            type="password"
            autocomplete="new-password"
            :label="t('settings.bounces.lettermintKey')"
            :help="t('globals.messages.passwordChange')"
            :disabled="!values.bounce?.lettermint.enabled"
          />
        </div>
      </div>
    </section>

    <Separator />

    <section v-if="box" class="space-y-4" data-cy="bounce-mailbox">
      <SettingSwitch name="bounce.mailboxes[0].enabled" :label="t('settings.bounces.enableMailbox')" :disabled="!on" />

      <div v-if="on && box.enabled" class="space-y-6 rounded-lg border p-4">
        <div class="grid items-start gap-6 md:grid-cols-[8rem_1fr_9rem]">
          <SettingSelect name="bounce.mailboxes[0].type" :label="t('settings.bounces.type')" :options="[{ value: 'pop', label: 'POP' }]" />
          <SettingInput
            name="bounce.mailboxes[0].host"
            :label="t('settings.mailserver.host')"
            :help="t('settings.mailserver.hostHelp')"
            placeholder="bounce.yourmailserver.net"
            :maxlength="200"
          />
          <SettingNumber name="bounce.mailboxes[0].port" :label="t('settings.mailserver.port')" :help="t('settings.mailserver.portHelp')" :min="1" :max="65535" />
        </div>

        <div class="grid items-start gap-6 md:grid-cols-[10rem_1fr_1fr]">
          <SettingSelect
            name="bounce.mailboxes[0].auth_protocol"
            :label="t('settings.mailserver.authProtocol')"
            :options="[
              { value: 'none', label: 'none' },
              { value: 'userpass', label: 'userpass' },
            ]"
          />
          <SettingInput
            name="bounce.mailboxes[0].username"
            :label="t('settings.mailserver.username')"
            placeholder="mysmtp"
            :maxlength="200"
            :disabled="box.auth_protocol === 'none'"
          />
          <SettingInput
            name="bounce.mailboxes[0].password"
            type="password"
            autocomplete="new-password"
            :label="t('settings.mailserver.password')"
            :help="t('settings.mailserver.passwordHelp')"
            :maxlength="200"
            :disabled="box.auth_protocol === 'none'"
          />
        </div>

        <div class="grid items-start gap-6 md:grid-cols-3">
          <SettingSwitch name="bounce.mailboxes[0].tls_enabled" :label="t('settings.mailserver.tls')" :help="t('settings.mailserver.tlsHelp')" />
          <SettingSwitch
            name="bounce.mailboxes[0].tls_skip_verify"
            :label="t('settings.mailserver.skipTLS')"
            :help="t('settings.mailserver.skipTLSHelp')"
            :disabled="!box.tls_enabled"
          />
          <SettingInput
            name="bounce.mailboxes[0].scan_interval"
            :label="t('settings.bounces.scanInterval')"
            :help="t('settings.bounces.scanIntervalHelp')"
            placeholder="15m"
            :maxlength="10"
          />
        </div>
      </div>
    </section>
  </div>
</template>
