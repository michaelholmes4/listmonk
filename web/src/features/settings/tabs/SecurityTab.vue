<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import { useFormContext } from 'vee-validate'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CopyText from '@/components/CopyText.vue'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { useConfig } from '@/composables/queries/useConfig'
import { useListRoles, useUserRoles } from '@/composables/queries/useRoles'
import { usePermission } from '@/composables/usePermission'
import SettingInput from '../fields/SettingInput.vue'
import SettingNumber from '../fields/SettingNumber.vue'
import SettingSelect from '../fields/SettingSelect.vue'
import SettingSwitch from '../fields/SettingSwitch.vue'
import SettingText from '../fields/SettingText.vue'
import ToggleRow from '../fields/ToggleRow.vue'
import { oidcProviders, type SettingsForm } from '../schema'

const { t } = useI18n()
const { values, setFieldValue } = useFormContext<SettingsForm>()
const { data: config } = useConfig()
const { can } = usePermission()

const oidcOn = computed(() => !!values.security?.oidc.enabled)
const autoCreate = computed(() => oidcOn.value && !!values.security?.oidc.auto_create_users)

// The roles OIDC users start with. Only offered to people who may list roles.
const userRoles = useUserRoles()
const listRoles = useListRoles()
const roleOptions = (rs?: { id?: number; name?: string | null }[]) => (rs ?? []).map((r) => ({ value: String(r.id), label: r.name ?? '' }))
const userRoleOptions = computed(() => roleOptions(userRoles.data.value))
const listRoleOptions = computed(() => roleOptions(listRoles.data.value))

function setProvider(p: keyof typeof oidcProviders) {
  setFieldValue('security.oidc.provider_url', oidcProviders[p].url)
  setFieldValue('security.oidc.provider_name', oidcProviders[p].name)
}

// Captcha: one switch, then a choice of provider; the two `enabled` flags are never both on.
const captchaOn = computed({
  get: () => !!(values.security?.captcha.altcha.enabled || values.security?.captcha.hcaptcha.enabled),
  set: (on) => {
    setFieldValue('security.captcha.altcha.enabled', on)
    setFieldValue('security.captcha.hcaptcha.enabled', false)
  },
})
const provider = computed({
  get: () => (values.security?.captcha.hcaptcha.enabled ? 'hcaptcha' : 'altcha'),
  set: (p) => {
    setFieldValue('security.captcha.hcaptcha.enabled', p === 'hcaptcha')
    setFieldValue('security.captcha.altcha.enabled', p === 'altcha')
  },
})

const redirectURL = computed(() => `${config.value?.root_url ?? ''}/auth/oidc`)
const urlLooksPublic = computed(() => {
  try {
    const h = new URL(config.value?.root_url ?? '').hostname
    return h !== 'localhost' && h !== '127.0.0.1'
  } catch {
    return false
  }
})
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-4" data-cy="oidc">
      <SettingSwitch name="security.oidc.enabled" :label="t('settings.security.enableOIDC')" :help="t('settings.security.OIDCHelp')" />
      <div class="space-y-4 pl-0 md:pl-12" :class="!oidcOn && 'opacity-60'">
        <div class="space-y-2">
          <SettingInput
            name="security.oidc.provider_url"
            type="url"
            :label="t('settings.security.OIDCURL')"
            placeholder="https://login.yoursite.com"
            :disabled="!oidcOn"
          />
          <div class="flex gap-3 text-xs">
            <button v-for="(p, key) in oidcProviders" :key="key" type="button" class="link-style" :disabled="!oidcOn" @click="setProvider(key)">
              {{ p.name }}
            </button>
          </div>
        </div>
        <SettingInput name="security.oidc.provider_name" :label="t('settings.security.OIDCName')" :maxlength="200" :disabled="!oidcOn" />
        <SettingInput name="security.oidc.client_id" :label="t('settings.security.OIDCClientID')" :maxlength="200" :disabled="!oidcOn" />
        <SettingInput
          name="security.oidc.client_secret"
          type="password"
          autocomplete="new-password"
          :label="t('settings.security.OIDCClientSecret')"
          :maxlength="200"
          :disabled="!oidcOn"
        />

        <Separator />

        <SettingSwitch
          name="security.oidc.auto_create_users"
          :label="t('settings.security.OIDCAutoCreateUsers')"
          :help="t('settings.security.OIDCAutoCreateUsersHelp')"
          :disabled="!oidcOn"
        />
        <div v-if="can('roles:get')" class="grid items-start gap-6 md:grid-cols-2">
          <SettingSelect
            name="security.oidc.default_user_role_id"
            :label="t('settings.security.OIDCDefaultUserRole')"
            :help="t('settings.security.OIDCDefaultRoleHelp')"
            :options="userRoleOptions"
            :disabled="!autoCreate"
            number
          />
          <SettingSelect
            name="security.oidc.default_list_role_id"
            :label="t('settings.security.OIDCDefaultListRole')"
            :help="t('settings.security.OIDCDefaultRoleHelp')"
            :options="listRoleOptions"
            :nullable="t('globals.terms.none')"
            :disabled="!autoCreate"
            number
          />
        </div>

        <Separator />

        <div class="space-y-1">
          <Label>{{ t('settings.security.OIDCRedirectURL') }}</Label>
          <div class="text-sm"><code><CopyText :text="redirectURL" /></code></div>
        </div>
        <p v-if="oidcOn && !urlLooksPublic" class="flex items-center gap-2 text-sm text-destructive">
          <TriangleAlert class="size-4" />{{ t('settings.security.OIDCRedirectWarning') }}
        </p>
      </div>
    </section>

    <Separator />

    <section class="space-y-4" data-cy="captcha">
      <ToggleRow v-model="captchaOn" :label="t('settings.security.enableCaptcha')" :help="t('settings.security.enableCaptchaHelp')" />
      <div v-if="captchaOn" class="space-y-4 pl-0 md:pl-12">
        <RadioGroup v-model="provider" class="flex gap-6">
          <div class="flex items-center gap-2">
            <RadioGroupItem id="captcha-altcha" value="altcha" />
            <Label for="captcha-altcha">ALTCHA</Label>
          </div>
          <div class="flex items-center gap-2">
            <RadioGroupItem id="captcha-hcaptcha" value="hcaptcha" />
            <Label for="captcha-hcaptcha">hCaptcha (deprecated)</Label>
          </div>
        </RadioGroup>
        <div v-if="provider === 'altcha'" class="max-w-xs">
          <SettingNumber
            name="security.captcha.altcha.complexity"
            :label="t('settings.security.altchaComplexity')"
            :help="t('settings.security.altchaComplexityHelp')"
            :min="1000"
            :max="1000000"
          />
        </div>
        <template v-else>
          <SettingInput
            name="security.captcha.hcaptcha.key"
            :label="t('settings.security.captchaKey')"
            :help="t('settings.security.captchaKeyHelp')"
            :maxlength="200"
          />
          <SettingInput
            name="security.captcha.hcaptcha.secret"
            type="password"
            autocomplete="new-password"
            :label="t('settings.security.captchaSecret')"
            :maxlength="200"
          />
        </template>
      </div>
    </section>

    <Separator />

    <section class="space-y-2">
      <h2 class="text-sm font-semibold">{{ t('settings.security.trustedURLs') }} / CORS</h2>
      <SettingText name="security.trusted_urls" :help="t('settings.security.trustedURLsHelp')" placeholder="https://example.com" />
    </section>
  </div>
</template>
