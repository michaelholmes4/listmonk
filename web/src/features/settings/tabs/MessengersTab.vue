<script setup lang="ts">
import { MessageSquare, Plus } from '@lucide/vue'
import { useFormContext } from 'vee-validate'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EmptyState from '@/components/EmptyState.vue'
import FormSection from '@/components/layout/FormSection.vue'
import { Button } from '@/components/ui/button'
import SettingInput from '../fields/SettingInput.vue'
import SettingNumber from '../fields/SettingNumber.vue'
import ServerCard from '../ServerCard.vue'
import { emptyMessenger, type SettingsForm } from '../schema'

const { t } = useI18n()
const urlPlaceholder = 'https://postback.messenger.net/path'
const { values, errors, setFieldValue } = useFormContext<SettingsForm>()
const messengers = computed(() => values.messengers ?? [])

// Which cards are open, by messenger key. A lone messenger starts open, several start closed.
const open = reactive<Record<string, boolean>>(messengers.value.length === 1 ? { [messengers.value[0]!._key]: true } : {})
// A messenger with a problem is flagged and opened, so a failed save shows the field at fault.
const hasErrors = (n: number) =>
  Object.keys(errors.value).some((p) => p.startsWith(`messengers[${n}]`) || p.startsWith(`messengers.${n}.`))
watch(errors, () => messengers.value.forEach((m, n) => hasErrors(n) && (open[m._key] = true)))

function add() {
  const m = emptyMessenger()
  open[m._key] = true
  setFieldValue('messengers', [...messengers.value, m])
}
const toRemove = ref<number | null>(null)
const removeOpen = computed({ get: () => toRemove.value !== null, set: (o) => !o && (toRemove.value = null) })
function remove() {
  setFieldValue('messengers', messengers.value.filter((_, i) => i !== toRemove.value))
  toRemove.value = null
}
const setEnabled = (n: number, on: boolean) =>
  setFieldValue('messengers', messengers.value.map((m, i) => (i === n ? { ...m, enabled: on } : m)))
</script>

<template>
  <div class="space-y-4">
    <EmptyState v-if="!messengers.length" :icon="MessageSquare" :title="t('web.settings.messengers.empty')">
      <template #action>
        <Button type="button" data-cy="messenger-add" @click="add">
          <Plus />{{ t('web.settings.messengers.add') }}
        </Button>
      </template>
    </EmptyState>

    <!-- One card per messenger: its header always shows, its settings open inside it. -->
    <ServerCard
      v-for="(m, n) in messengers"
      :key="m._key"
      v-model:open="open[m._key]"
      :title="m.name || t('web.settings.messengers.messenger', { n: n + 1 })"
      :subtitle="m.root_url || undefined"
      :enabled="m.enabled"
      :has-errors="hasErrors(n)"
      deletable
      :cy="`messenger-${n}`"
      :data-cy="`messenger-${n}`"
      @update:enabled="setEnabled(n, $event)"
      @delete="toRemove = n"
    >
      <fieldset :disabled="!m.enabled" class="min-w-0 space-y-8 border-0 p-0" :class="!m.enabled && 'opacity-60'">
        <FormSection :title="t('web.settings.messengers.postback')" :description="t('settings.messengers.urlHelp')">
          <SettingInput
            :name="`messengers[${n}].name`"
            :label="t('globals.fields.name')"
            :help="t('settings.messengers.nameHelp')"
            placeholder="mymessenger"
            :maxlength="200"
          />
          <SettingInput
            :name="`messengers[${n}].root_url`"
            type="url"
            :label="t('settings.messengers.url')"
            :placeholder="urlPlaceholder"
            :maxlength="200"
          />
          <div class="grid items-start gap-6 sm:grid-cols-2">
            <SettingInput
              :name="`messengers[${n}].username`"
              :label="t('settings.messengers.username')"
              :maxlength="200"
            />
            <SettingInput
              :name="`messengers[${n}].password`"
              type="password"
              autocomplete="new-password"
              :label="t('settings.messengers.password')"
              :help="t('globals.messages.passwordChange')"
              :maxlength="200"
            />
          </div>
        </FormSection>

        <FormSection :title="t('web.settings.smtp.limits')" :description="t('web.settings.smtp.limitsHelp')">
          <div class="grid items-start gap-6 sm:grid-cols-2">
            <SettingNumber
              :name="`messengers[${n}].max_conns`"
              :label="t('settings.messengers.maxConns')"
              :help="t('settings.messengers.maxConnsHelp')"
              :min="1"
              :max="65535"
            />
            <SettingNumber
              :name="`messengers[${n}].max_msg_retries`"
              :label="t('settings.messengers.retries')"
              :help="t('settings.messengers.retriesHelp')"
              :min="1"
              :max="1000"
            />
          </div>
          <SettingInput
            :name="`messengers[${n}].timeout`"
            :label="t('settings.messengers.timeout')"
            :help="t('settings.messengers.timeoutHelp')"
            placeholder="5s"
            :maxlength="10"
            short
          />
        </FormSection>
      </fieldset>
    </ServerCard>

    <Button v-if="messengers.length" type="button" variant="outline" data-cy="messenger-add" @click="add">
      <Plus />{{ t('web.settings.messengers.add') }}
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
