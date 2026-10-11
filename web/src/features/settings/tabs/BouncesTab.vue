<script setup lang="ts">
import { useFormContext } from 'vee-validate'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FormSection from '@/components/layout/FormSection.vue'
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  <div class="space-y-8">
    <FormSection
      :title="t('web.settings.bounces.actions')"
      :description="t('web.settings.bounces.actionsHelp')"
      data-cy="bounce-actions"
    >
      <SettingSwitch name="bounce.enabled" :label="t('settings.bounces.enable')" />

      <!-- A small table: one row per kind of bounce, the column headings label the fields. -->
      <div class="grid w-fit grid-cols-[7rem_7rem_11rem] items-start gap-x-4 gap-y-3" :class="!on && 'opacity-60'">
        <span />
        <span class="text-sm font-medium">{{ t('settings.bounces.count') }}</span>
        <span class="text-sm font-medium">{{ t('settings.bounces.action') }}</span>
        <template v-for="typ in bounceTypes" :key="typ">
          <span class="pt-2 text-sm">{{ t(`bounces.${typ}`) }}</span>
          <FormField v-slot="{ value, handleChange, handleBlur }" :name="`bounce.actions.${typ}.count`">
            <FormItem>
              <FormControl>
                <Input
                  type="number"
                  inputmode="numeric"
                  :min="1"
                  :max="1000"
                  :model-value="value"
                  :disabled="!on"
                  :aria-label="`${t(`bounces.${typ}`)}: ${t('settings.bounces.count')}`"
                  @update:model-value="handleChange($event === '' ? undefined : Number($event))"
                  @blur="handleBlur"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ value, handleChange }" :name="`bounce.actions.${typ}.action`">
            <FormItem>
              <Select :model-value="value" :disabled="!on" @update:model-value="handleChange">
                <FormControl>
                  <SelectTrigger
                    class="w-full"
                    :data-cy="`bounce.actions.${typ}.action`"
                    :aria-label="`${t(`bounces.${typ}`)}: ${t('settings.bounces.action')}`"
                  >
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem v-for="o in actionOptions" :key="o.value" :value="o.value">{{ o.label }}</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          </FormField>
        </template>
      </div>
    </FormSection>

    <FormSection
      :title="t('web.settings.bounces.webhooks')"
      :description="t('web.settings.bounces.webhooksHelp')"
      data-cy="bounce-webhooks"
    >
      <SettingSwitch name="bounce.webhooks_enabled" :label="t('settings.bounces.enableWebhooks')" :disabled="!on" />
      <a href="https://listmonk.app/docs/bounces" target="_blank" rel="noopener noreferrer" class="link-style text-sm">
        {{ t('globals.buttons.learnMore') }} &rarr;
      </a>

      <template v-if="hooks">
        <SettingSwitch name="bounce.ses_enabled" :label="t('settings.bounces.enableSES')" />

        <SettingSwitch name="bounce.sendgrid_enabled" :label="t('settings.bounces.enableSendgrid')" />
        <SettingInput
          v-if="values.bounce?.sendgrid_enabled"
          name="bounce.sendgrid_key"
          type="password"
          autocomplete="new-password"
          :label="t('settings.bounces.sendgridKey')"
          :help="t('globals.messages.passwordChange')"
        />

        <SettingSwitch name="bounce.azure.enabled" :label="t('settings.bounces.enableAzure')" />
        <template v-if="values.bounce?.azure.enabled">
          <SettingInput
            name="bounce.azure.shared_secret"
            type="password"
            autocomplete="new-password"
            :label="t('settings.bounces.azureSharedSecret')"
            :help="t('settings.bounces.azureSharedSecretHelp')"
          />
          <SettingInput
            name="bounce.azure.shared_secret_header"
            :label="t('settings.bounces.azureSharedSecretHeader')"
            :help="t('settings.bounces.azureSharedSecretHeaderHelp')"
          />
        </template>

        <SettingSwitch name="bounce.postmark.enabled" :label="t('settings.bounces.enablePostmark')" />
        <template v-if="values.bounce?.postmark.enabled">
          <p class="text-sm text-muted-foreground">{{ t('settings.bounces.postmarkUsernameHelp') }}</p>
          <div class="grid items-start gap-6 sm:grid-cols-2">
            <SettingInput name="bounce.postmark.username" :label="t('settings.bounces.postmarkUsername')" />
            <SettingInput
              name="bounce.postmark.password"
              type="password"
              autocomplete="new-password"
              :label="t('settings.bounces.postmarkPassword')"
              :help="t('globals.messages.passwordChange')"
            />
          </div>
        </template>

        <SettingSwitch name="bounce.forwardemail.enabled" :label="t('settings.bounces.enableForwardemail')" />
        <SettingInput
          v-if="values.bounce?.forwardemail.enabled"
          name="bounce.forwardemail.key"
          type="password"
          autocomplete="new-password"
          :label="t('settings.bounces.forwardemailKey')"
          :help="t('globals.messages.passwordChange')"
        />

        <SettingSwitch name="bounce.lettermint.enabled" :label="t('settings.bounces.enableLettermint')" />
        <SettingInput
          v-if="values.bounce?.lettermint.enabled"
          name="bounce.lettermint.key"
          type="password"
          autocomplete="new-password"
          :label="t('settings.bounces.lettermintKey')"
          :help="t('globals.messages.passwordChange')"
        />
      </template>
    </FormSection>

    <FormSection
      v-if="box"
      :title="t('web.settings.bounces.mailbox')"
      :description="t('web.settings.bounces.mailboxHelp')"
      data-cy="bounce-mailbox"
    >
      <SettingSwitch name="bounce.mailboxes[0].enabled" :label="t('settings.bounces.enableMailbox')" :disabled="!on" />

      <template v-if="on && box.enabled">
        <SettingSelect
          name="bounce.mailboxes[0].type"
          :label="t('settings.bounces.type')"
          :options="[{ value: 'pop', label: 'POP' }]"
        />
        <div class="grid items-start gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
          <SettingInput
            name="bounce.mailboxes[0].host"
            :label="t('settings.mailserver.host')"
            :help="t('settings.mailserver.hostHelp')"
            placeholder="bounce.yourmailserver.net"
            :maxlength="200"
          />
          <SettingNumber
            name="bounce.mailboxes[0].port"
            :label="t('settings.mailserver.port')"
            :help="t('settings.mailserver.portHelp')"
            :min="1"
            :max="65535"
          />
        </div>
        <SettingSwitch
          name="bounce.mailboxes[0].tls_enabled"
          :label="t('settings.mailserver.tls')"
          :help="t('settings.mailserver.tlsHelp')"
        />
        <SettingSwitch
          name="bounce.mailboxes[0].tls_skip_verify"
          :label="t('settings.mailserver.skipTLS')"
          :help="t('settings.mailserver.skipTLSHelp')"
          :disabled="!box.tls_enabled"
        />
        <SettingSelect
          name="bounce.mailboxes[0].auth_protocol"
          :label="t('settings.mailserver.authProtocol')"
          :options="[
            { value: 'none', label: 'none' },
            { value: 'userpass', label: 'userpass' },
          ]"
        />
        <div class="grid items-start gap-6 sm:grid-cols-2">
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
        <SettingInput
          name="bounce.mailboxes[0].scan_interval"
          :label="t('settings.bounces.scanInterval')"
          :help="t('settings.bounces.scanIntervalHelp')"
          placeholder="15m"
          :maxlength="10"
          short
        />
      </template>
    </FormSection>
  </div>
</template>
