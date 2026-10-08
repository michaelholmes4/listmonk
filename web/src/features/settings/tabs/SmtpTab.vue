<script setup lang="ts">
import { Loader2, Plus, Rocket, Trash2 } from '@lucide/vue'
import { useFormContext } from 'vee-validate'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useTestSMTP } from '@/composables/queries/useSettings'
import SettingInput from '../fields/SettingInput.vue'
import SettingNumber from '../fields/SettingNumber.vue'
import SettingSelect from '../fields/SettingSelect.vue'
import SettingSwitch from '../fields/SettingSwitch.vue'
import SettingTags from '../fields/SettingTags.vue'
import SettingText from '../fields/SettingText.vue'
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
const { values, setFieldValue } = useFormContext<SettingsForm>()
const servers = computed(() => values.smtp ?? [])

function add() {
  setFieldValue('smtp', [...servers.value, emptySmtp()])
}
const toRemove = ref<number | null>(null)
const removeOpen = computed({ get: () => toRemove.value !== null, set: (o) => !o && (toRemove.value = null) })
function remove() {
  setFieldValue('smtp', servers.value.filter((_, i) => i !== toRemove.value))
  toRemove.value = null
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
const testing = ref<number | null>(null)
const testEmail = ref('')
const errMsg = ref('')
const test = useTestSMTP()

function startTest(i: number) {
  testing.value = i
  errMsg.value = ''
}
function sendTest(s: SmtpForm) {
  // The password is masked until retyped; the server can't test with bullets.
  if (!s.host || !s.port || (s.auth_protocol !== 'none' && s.password.includes('•'))) {
    toast.error(t('settings.smtp.testEnterEmail'))
    return
  }
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
  <div class="space-y-6">
    <section v-for="(s, i) in servers" :key="s._key" class="space-y-6 rounded-lg border p-4" :data-cy="`smtp-${i}`">
      <div class="flex items-center justify-between gap-4">
        <SettingSwitch :name="`smtp[${i}].enabled`" :label="t('globals.buttons.enabled')" />
        <Button v-if="servers.length > 1" type="button" variant="ghost" size="sm" :data-cy="`smtp-delete-${i}`" @click="toRemove = i">
          <Trash2 />{{ t('globals.buttons.delete') }}
        </Button>
      </div>

      <fieldset :disabled="!s.enabled" class="min-w-0 space-y-6 border-0 p-0" :class="!s.enabled && 'opacity-60'">
        <div class="grid items-start gap-6 md:grid-cols-[1fr_10rem]">
          <SettingInput
            :name="`smtp[${i}].host`"
            :label="t('settings.mailserver.host')"
            :help="t('settings.mailserver.hostHelp')"
            placeholder="smtp.yourmailserver.net"
            :maxlength="200"
          />
          <SettingNumber :name="`smtp[${i}].port`" :label="t('settings.mailserver.port')" :help="t('settings.mailserver.portHelp')" :min="1" :max="65535" />
        </div>

        <div class="grid items-start gap-6 md:grid-cols-[10rem_1fr_1fr]">
          <SettingSelect :name="`smtp[${i}].auth_protocol`" :label="t('settings.mailserver.authProtocol')" :options="authOptions" />
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

        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <button v-for="(label, key) in smtpPresetLabels" :key="key" type="button" class="link-style" @click="applyPreset(i, key)">
            {{ label }}
          </button>
        </div>

        <Separator />

        <div class="grid items-start gap-6 md:grid-cols-2">
          <SettingInput :name="`smtp[${i}].hello_hostname`" :label="t('settings.smtp.heloHost')" :help="t('settings.smtp.heloHostHelp')" :maxlength="200" />
          <div class="space-y-4">
            <SettingSelect :name="`smtp[${i}].tls_type`" :label="t('settings.mailserver.tls')" :help="t('settings.mailserver.tlsHelp')" :options="tlsOptions" />
            <SettingSwitch
              :name="`smtp[${i}].tls_skip_verify`"
              :label="t('settings.mailserver.skipTLS')"
              :help="t('settings.mailserver.skipTLSHelp')"
              :disabled="s.tls_type === 'none'"
            />
          </div>
        </div>

        <Separator />

        <div class="grid items-start gap-6 md:grid-cols-3">
          <SettingNumber :name="`smtp[${i}].max_conns`" :label="t('settings.mailserver.maxConns')" :help="t('settings.mailserver.maxConnsHelp')" :min="1" :max="65535" />
          <SettingInput :name="`smtp[${i}].idle_timeout`" :label="t('settings.mailserver.idleTimeout')" :help="t('settings.mailserver.idleTimeoutHelp')" placeholder="15s" :maxlength="10" />
          <SettingInput :name="`smtp[${i}].wait_timeout`" :label="t('settings.mailserver.waitTimeout')" :help="t('settings.mailserver.waitTimeoutHelp')" placeholder="5s" :maxlength="10" />
          <SettingNumber :name="`smtp[${i}].max_msg_retries`" :label="t('settings.smtp.retries')" :help="t('settings.smtp.retriesHelp')" :min="1" :max="1000" />
          <SettingInput :name="`smtp[${i}].msg_retry_delay`" :label="t('settings.smtp.retryDelay')" :help="t('settings.smtp.retryDelayHelp')" placeholder="0s" :maxlength="10" />
        </div>

        <Separator />

        <div class="grid items-start gap-6 md:grid-cols-2">
          <SettingInput :name="`smtp[${i}].name`" :label="t('globals.fields.name')" :help="t('settings.mailserver.nameHelp')" placeholder="email-primary" :maxlength="100" />
          <SettingTags
            :name="`smtp[${i}].from_addresses`"
            :label="t('settings.smtp.fromAddresses')"
            :help="t('settings.smtp.fromAddressesHelp')"
            placeholder="user@example.com, anothersite.com"
            :accept="validFrom"
          />
        </div>

        <SettingText
          v-if="s.strEmailHeaders || showHeaders.has(s._key)"
          :name="`smtp[${i}].strEmailHeaders`"
          :help="t('settings.smtp.customHeadersHelp')"
          placeholder="[{&quot;X-Custom&quot;: &quot;value&quot;}, {&quot;X-Custom2&quot;: &quot;value&quot;}]"
        />
        <button v-else type="button" class="link-style inline-flex items-center gap-1 text-sm" @click="showHeaders = new Set(showHeaders).add(s._key)">
          <Plus class="size-4" />{{ t('settings.smtp.setCustomHeaders') }}
        </button>
      </fieldset>

      <Separator />

      <div class="space-y-3">
        <div v-if="testing === i" class="flex flex-wrap items-end gap-4">
          <div class="text-sm">
            <p class="font-medium">{{ t('settings.general.fromEmail') }}</p>
            <p class="text-muted-foreground">{{ values.app?.from_email }}</p>
          </div>
          <div class="w-64 space-y-2">
            <Label :for="`smtp-test-${i}`">{{ t('settings.smtp.toEmail') }}</Label>
            <Input :id="`smtp-test-${i}`" v-model="testEmail" type="email" placeholder="email@site.com" @keydown.enter.prevent="sendTest(s)" />
          </div>
          <Button type="button" :disabled="test.isPending.value || !testEmail" :data-cy="`smtp-send-test-${i}`" @click="sendTest(s)">
            <Loader2 v-if="test.isPending.value" class="animate-spin" />{{ t('settings.smtp.sendTest') }}
          </Button>
        </div>
        <Button v-else type="button" variant="ghost" size="sm" :data-cy="`smtp-test-${i}`" @click="startTest(i)">
          <Rocket />{{ t('settings.smtp.testConnection') }}
        </Button>
        <pre v-if="errMsg && testing === i" class="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" data-cy="smtp-test-error">{{ errMsg }}</pre>
      </div>
    </section>

    <Button type="button" data-cy="smtp-add" @click="add"><Plus />{{ t('globals.buttons.addNew') }}</Button>

    <ConfirmDialog
      v-model:open="removeOpen"
      destructive
      :title="t('globals.messages.confirm')"
      :confirm-label="t('globals.buttons.delete')"
      @confirm="remove"
    />
  </div>
</template>
