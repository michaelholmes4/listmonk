<script setup lang="ts">
import { CircleCheck, Loader2 } from '@lucide/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { User } from '@/api/types'
import CopyText from '@/components/CopyText.vue'
import FormSection from '@/components/layout/FormSection.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTotp } from '@/composables/queries/useProfile'

/**
 * Authenticator-app (TOTP) two-factor for the signed-in user. Turning it on shows a QR code and
 * waits for a code from the app; turning it off asks for the account password.
 */
const props = defineProps<{ user: User }>()

const { t } = useI18n()
const totp = useTotp(() => props.user.id!)

const enabled = () => props.user.twofa_type === 'totp'
type Step = 'idle' | 'enroll' | 'disable'
const step = ref<Step>('idle')
const qr = ref('')
const secret = ref('')
const code = ref('')
const password = ref('')

function reset() {
  step.value = 'idle'
  qr.value = secret.value = code.value = password.value = ''
}

function onToggle(on: boolean) {
  if (on && !enabled()) {
    totp.setup.mutate(undefined, {
      onSuccess: (s) => {
        qr.value = s.qr ?? ''
        secret.value = s.secret ?? ''
        step.value = 'enroll'
      },
    })
  } else if (!on && enabled()) {
    step.value = 'disable'
  }
}

function confirmEnable() {
  totp.enable.mutate(
    { secret: secret.value, code: code.value.trim() },
    {
      onSuccess: () => {
        toast.success(t('users.twoFAEnabled'))
        reset()
      },
    },
  )
}

function confirmDisable() {
  totp.disable.mutate(password.value, {
    onSuccess: () => {
      toast.success(t('globals.messages.done'))
      reset()
    },
  })
}
</script>

<template>
  <FormSection
    :title="t('users.twoFA')"
    :description="enabled() ? t('users.twoFAEnabledDesc', { type: (user.twofa_type ?? '').toUpperCase() }) : t('users.twoFANotEnabled')"
    data-cy="twofa"
  >
    <div class="flex items-center justify-between gap-4 rounded-lg border p-3">
      <p class="flex items-center gap-2 text-sm font-medium">
        <CircleCheck v-if="enabled()" class="size-4 text-primary" />
        {{ enabled() ? t('users.twoFAEnabled') : t('globals.buttons.enable') }}
      </p>
      <Switch
        v-if="step === 'idle'"
        :model-value="enabled()"
        :disabled="totp.setup.isPending.value"
        :aria-label="t('users.twoFA')"
        data-cy="twofa-switch"
        @update:model-value="onToggle"
      />
    </div>

    <form v-if="step === 'enroll'" class="space-y-4" @submit.prevent="confirmEnable">
      <p class="text-sm text-muted-foreground">{{ t('users.totpScanQR') }}</p>
      <img :src="`data:image/png;base64,${qr}`" alt="QR code" class="size-48 rounded-md border bg-white p-2" />
      <div class="space-y-1">
        <p class="text-sm font-medium">{{ t('users.totpSecret') }}</p>
        <CopyText :text="secret" />
      </div>
      <div class="max-w-xs space-y-2">
        <Label for="totp-code">{{ t('users.totpCode') }}</Label>
        <Input
          id="totp-code"
          v-model="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          pattern="[0-9]{6}"
          placeholder="000000"
          required
          autofocus
        />
        <p class="text-xs text-muted-foreground">{{ t('users.totpCodeHelp') }}</p>
      </div>
      <div class="flex gap-2">
        <Button type="submit" :disabled="totp.enable.isPending.value || code.length !== 6" data-cy="twofa-enable">
          <Loader2 v-if="totp.enable.isPending.value" class="animate-spin" />{{ t('globals.buttons.enable') }}
        </Button>
        <Button type="button" variant="outline" @click="reset">{{ t('globals.buttons.cancel') }}</Button>
      </div>
    </form>

    <form v-if="step === 'disable'" class="space-y-4" @submit.prevent="confirmDisable">
      <div class="max-w-xs space-y-2">
        <Label for="totp-password">{{ t('users.password') }}</Label>
        <Input id="totp-password" v-model="password" type="password" minlength="8" autocomplete="current-password" required autofocus />
      </div>
      <div class="flex gap-2">
        <Button type="submit" variant="destructive" :disabled="totp.disable.isPending.value" data-cy="twofa-disable">
          <Loader2 v-if="totp.disable.isPending.value" class="animate-spin" />{{ t('globals.buttons.disable') }}
        </Button>
        <Button type="button" variant="outline" @click="reset">{{ t('globals.buttons.cancel') }}</Button>
      </div>
    </form>
  </FormSection>
</template>
