<script setup lang="ts">
import { Loader2, Plus, Rocket } from '@lucide/vue'
import { useFormContext } from 'vee-validate'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FormSection from '@/components/layout/FormSection.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTestSMTP } from '@/composables/queries/useSettings'
import SettingInput from '../fields/SettingInput.vue'
import SettingNumber from '../fields/SettingNumber.vue'
import SettingSelect from '../fields/SettingSelect.vue'
import SettingSwitch from '../fields/SettingSwitch.vue'
import SettingTags from '../fields/SettingTags.vue'
import SettingText from '../fields/SettingText.vue'
import ServerCard from '../ServerCard.vue'
import {
  emptySmtp,
  fromAddressPattern,
  parseEmailHeaders,
  smtpPresetLabels,
  smtpPresets,
  type SettingsForm,
  type SmtpForm,
} from '../schema'

const { t } = useI18n()
const { values, errors, setFieldValue } = useFormContext<SettingsForm>()
const servers = computed(() => values.smtp ?? [])

// Which cards are open, by server key. A lone server starts open, several start closed.
const open = reactive<Record<string, boolean>>(servers.value.length === 1 ? { [servers.value[0]!._key]: true } : {})
// A server with a problem is flagged and opened, so a failed save shows the field at fault.
const hasErrors = (i: number) => Object.keys(errors.value).some((p) => p.startsWith(`smtp[${i}]`) || p.startsWith(`smtp.${i}.`))
watch(errors, () => servers.value.forEach((s, i) => hasErrors(i) && (open[s._key] = true)))

function add() {
  const s = emptySmtp()
  open[s._key] = true
  setFieldValue('smtp', [...servers.value, s])
}
const toRemove = ref<number | null>(null)
const removeOpen = computed({ get: () => toRemove.value !== null, set: (o) => !o && (toRemove.value = null) })
function remove() {
  setFieldValue('smtp', servers.value.filter((_, i) => i !== toRemove.value))
  toRemove.value = null
}

function setEnabled(i: number, on: boolean) {
  setFieldValue('smtp', servers.value.map((s, n) => (n === i ? { ...s, enabled: on } : s)))
}

function applyPreset(i: number, key: keyof typeof smtpPresets) {
  setFieldValue(
    'smtp',
    servers.value.map((s, n) => (n === i ? { ...s, ...smtpPresets[key], username: '', password: '', hello_hostname: '', tls_skip_verify: false } : s)),
  )
}

// Custom headers stay folded away until there are some (or the user asks for the box).
const showHeaders = ref(new Set<string>())

// --- Test a server with a real message. -------------------------------------------------------------
// The server last tested: its result shows under it.
const testing = ref<number | null>(null)
const testEmail = ref('')
const errMsg = ref('')
const test = useTestSMTP()

function sendTest(i: number, s: SmtpForm) {
  // The password is masked until retyped; the server can't test with bullets.
  if (!s.host || !s.port || (s.auth_protocol !== 'none' && s.password.includes('•'))) {
    toast.error(t('settings.smtp.testEnterEmail'))
    // As upstream: clear the masked password and put the cursor there for retyping.
    if (s.password.includes('•')) {
      setFieldValue('smtp', servers.value.map((x, n) => (n === i ? { ...x, password: '' } : x)))
      nextTick(() => document.querySelector<HTMLInputElement>(`input[name="smtp[${i}].password"]`)?.focus())
    }
    return
  }
  testing.value = i
  errMsg.value = ''
  test.mutate(
    {
      uuid: s.uuid,
      name: s.name,
      enabled: s.enabled,
      host: s.host.trim(),
      hello_hostname: s.hello_hostname,
      port: s.port,
      auth_protocol: s.auth_protocol,
      username: s.username,
      password: s.password,
      email_headers: parseEmailHeaders(s.strEmailHeaders) ?? [],
      max_conns: s.max_conns,
      max_msg_retries: s.max_msg_retries,
      msg_retry_delay: s.msg_retry_delay,
      idle_timeout: s.idle_timeout,
      wait_timeout: s.wait_timeout,
      tls_type: s.tls_type,
      tls_skip_verify: s.tls_skip_verify,
      from_addresses: s.from_addresses,
      email: testEmail.value,
    },
    {
      onSuccess: () => toast.success(t('campaigns.testSent')),
      onError: (e) => (errMsg.value = e instanceof Error ? e.message : String(e)),
    },
  )
}
const validFrom = (v: string) => fromAddressPattern.test(v)
const authOptions = [
  { value: 'login', label: 'LOGIN' },
  { value: 'cram', label: 'CRAM' },
  { value: 'plain', label: 'PLAIN' },
  { value: 'none', label: 'None' },
]
const tlsOptions = computed(() => [
  { value: 'none', label: t('globals.states.off') },
  { value: 'STARTTLS', label: 'STARTTLS' },
  { value: 'TLS', label: 'SSL/TLS' },
])
</script>

<template>
  <div class="space-y-4">
    <!-- One card per server: its header always shows, its settings open inside it. -->
    <ServerCard
      v-for="(s, i) in servers"
      :key="s._key"
      v-model:open="open[s._key]"
      :title="s.name || t('web.settings.smtp.server', { n: i + 1 })"
      :subtitle="s.host ? `${s.host}:${s.port}` : undefined"
      :enabled="s.enabled"
      :has-errors="hasErrors(i)"
      :deletable="servers.length > 1"
      :cy="`smtp-${i}`"
      :data-cy="`smtp-${i}`"
      @update:enabled="setEnabled(i, $event)"
      @delete="toRemove = i"
    >
      <fieldset :disabled="!s.enabled" class="min-w-0 space-y-8 border-0 p-0" :class="!s.enabled && 'opacity-60'">
        <FormSection :title="t('web.settings.smtp.connection')" :description="t('web.settings.smtp.connectionHelp')">
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <button
              v-for="(label, key) in smtpPresetLabels"
              :key="key"
              type="button"
              class="link-style"
              @click="applyPreset(i, key)"
            >
              {{ label }}
            </button>
          </div>
          <div class="grid items-start gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
            <SettingInput
              :name="`smtp[${i}].host`"
              :label="t('settings.mailserver.host')"
              :help="t('settings.mailserver.hostHelp')"
              placeholder="smtp.yourmailserver.net"
              :maxlength="200"
            />
            <SettingNumber
              :name="`smtp[${i}].port`"
              :label="t('settings.mailserver.port')"
              :help="t('settings.mailserver.portHelp')"
              :min="1"
              :max="65535"
            />
          </div>
          <SettingSelect
            :name="`smtp[${i}].tls_type`"
            :label="t('settings.mailserver.tls')"
            :help="t('settings.mailserver.tlsHelp')"
            :options="tlsOptions"
          />
          <SettingSwitch
            :name="`smtp[${i}].tls_skip_verify`"
            :label="t('settings.mailserver.skipTLS')"
            :help="t('settings.mailserver.skipTLSHelp')"
            :disabled="s.tls_type === 'none'"
          />
          <SettingInput
            :name="`smtp[${i}].hello_hostname`"
            :label="t('settings.smtp.heloHost')"
            :help="t('settings.smtp.heloHostHelp')"
            :maxlength="200"
          />
        </FormSection>

        <FormSection :title="t('web.settings.smtp.auth')">
          <SettingSelect
            :name="`smtp[${i}].auth_protocol`"
            :label="t('settings.mailserver.authProtocol')"
            :options="authOptions"
          />
          <div class="grid items-start gap-6 sm:grid-cols-2">
            <SettingInput
              :name="`smtp[${i}].username`"
              :label="t('settings.mailserver.username')"
              placeholder="mysmtp"
              :maxlength="200"
              :disabled="s.auth_protocol === 'none'"
            />
            <SettingInput
              :name="`smtp[${i}].password`"
              type="password"
              autocomplete="new-password"
              :label="t('settings.mailserver.password')"
              :help="t('settings.mailserver.passwordHelp')"
              :maxlength="200"
              :disabled="s.auth_protocol === 'none'"
            />
          </div>
        </FormSection>

        <FormSection :title="t('web.settings.smtp.limits')" :description="t('web.settings.smtp.limitsHelp')">
          <div class="grid items-start gap-6 sm:grid-cols-2">
            <SettingNumber
              :name="`smtp[${i}].max_conns`"
              :label="t('settings.mailserver.maxConns')"
              :help="t('settings.mailserver.maxConnsHelp')"
              :min="1"
              :max="65535"
            />
            <SettingNumber
              :name="`smtp[${i}].max_msg_retries`"
              :label="t('settings.smtp.retries')"
              :help="t('settings.smtp.retriesHelp')"
              :min="1"
              :max="1000"
            />
            <SettingInput
              :name="`smtp[${i}].idle_timeout`"
              :label="t('settings.mailserver.idleTimeout')"
              :help="t('settings.mailserver.idleTimeoutHelp')"
              placeholder="15s"
              :maxlength="10"
              short
            />
            <SettingInput
              :name="`smtp[${i}].wait_timeout`"
              :label="t('settings.mailserver.waitTimeout')"
              :help="t('settings.mailserver.waitTimeoutHelp')"
              placeholder="5s"
              :maxlength="10"
              short
            />
          </div>
          <SettingInput
            :name="`smtp[${i}].msg_retry_delay`"
            :label="t('settings.smtp.retryDelay')"
            :help="t('settings.smtp.retryDelayHelp')"
            placeholder="0s"
            :maxlength="10"
            short
          />
        </FormSection>

        <FormSection :title="t('web.settings.smtp.routing')" :description="t('web.settings.smtp.routingHelp')">
          <SettingInput
            :name="`smtp[${i}].name`"
            :label="t('globals.fields.name')"
            :help="t('settings.mailserver.nameHelp')"
            placeholder="email-primary"
            :maxlength="100"
          />
          <SettingTags
            :name="`smtp[${i}].from_addresses`"
            :label="t('settings.smtp.fromAddresses')"
            :help="t('settings.smtp.fromAddressesHelp')"
            placeholder="user@example.com, anothersite.com"
            :accept="validFrom"
          />
          <SettingText
            v-if="s.strEmailHeaders || showHeaders.has(s._key)"
            :name="`smtp[${i}].strEmailHeaders`"
            :label="t('settings.smtp.customHeaders')"
            :help="t('settings.smtp.customHeadersHelp')"
            placeholder="[{&quot;X-Custom&quot;: &quot;value&quot;}, {&quot;X-Custom2&quot;: &quot;value&quot;}]"
          />
          <button
            v-else
            type="button"
            class="link-style inline-flex items-center gap-1 text-sm"
            @click="showHeaders = new Set(showHeaders).add(s._key)"
          >
            <Plus class="size-4" />{{ t('settings.smtp.setCustomHeaders') }}
          </button>
        </FormSection>
      </fieldset>

      <FormSection
        :title="t('settings.smtp.testConnection')"
        :description="t('web.settings.smtp.testHelp', { from: values.app?.from_email ?? '' })"
      >
        <div class="flex flex-wrap items-end gap-4">
          <div class="w-64 space-y-2">
            <Label :for="`smtp-test-${i}`">{{ t('settings.smtp.toEmail') }}</Label>
            <Input
              :id="`smtp-test-${i}`"
              v-model="testEmail"
              type="email"
              placeholder="email@site.com"
              @keydown.enter.prevent="sendTest(i, s)"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            :disabled="test.isPending.value || !testEmail"
            :data-cy="`smtp-send-test-${i}`"
            @click="sendTest(i, s)"
          >
            <Loader2 v-if="test.isPending.value && testing === i" class="animate-spin" /><Rocket v-else />{{
              t('settings.smtp.sendTest')
            }}
          </Button>
        </div>
        <pre
          v-if="errMsg && testing === i"
          class="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
          data-cy="smtp-test-error"
        >{{ errMsg }}</pre>
      </FormSection>
    </ServerCard>

    <Button type="button" variant="outline" data-cy="smtp-add" @click="add">
      <Plus />{{ t('web.settings.smtp.add') }}
    </Button>

    <ConfirmDialog
      v-model:open="removeOpen"
      destructive
      :title="t('globals.messages.confirm')"
      :confirm-label="t('globals.buttons.delete')"
      @confirm="remove"
    />
  </div>
</template>
