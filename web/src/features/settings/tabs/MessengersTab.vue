<script setup lang="ts">
import { Plus, Trash2 } from '@lucide/vue'
import { useFormContext } from 'vee-validate'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import SettingInput from '../fields/SettingInput.vue'
import SettingNumber from '../fields/SettingNumber.vue'
import SettingSwitch from '../fields/SettingSwitch.vue'
import { emptyMessenger, type SettingsForm } from '../schema'

const { t } = useI18n()
const urlPlaceholder = 'https://postback.messenger.net/path'
const { values, setFieldValue } = useFormContext<SettingsForm>()
const messengers = computed(() => values.messengers ?? [])

const add = () => setFieldValue('messengers', [...messengers.value, emptyMessenger()])
const toRemove = ref<number | null>(null)
const removeOpen = computed({ get: () => toRemove.value !== null, set: (o) => !o && (toRemove.value = null) })
function remove() {
  setFieldValue('messengers', messengers.value.filter((_, i) => i !== toRemove.value))
  toRemove.value = null
}
</script>

<template>
  <div class="space-y-6">
    <section v-for="(m, n) in messengers" :key="m._key" class="space-y-6 rounded-lg border p-4" :data-cy="`messenger-${n}`">
      <div class="flex items-center justify-between gap-4">
        <SettingSwitch :name="`messengers[${n}].enabled`" :label="t('globals.buttons.enabled')" />
        <Button type="button" variant="ghost" size="sm" @click="toRemove = n"><Trash2 />{{ t('globals.buttons.delete') }}</Button>
      </div>

      <fieldset :disabled="!m.enabled" class="min-w-0 space-y-6 border-0 p-0" :class="!m.enabled && 'opacity-60'">
        <SettingInput :name="`messengers[${n}].name`" :label="t('globals.fields.name')" :help="t('settings.messengers.nameHelp')" placeholder="mymessenger" :maxlength="200" />
        <SettingInput
          :name="`messengers[${n}].root_url`"
          type="url"
          :label="t('settings.messengers.url')"
          :help="t('settings.messengers.urlHelp')"
          :placeholder="urlPlaceholder"
          :maxlength="200"
        />
        <div class="grid items-start gap-6 md:grid-cols-2">
          <SettingInput :name="`messengers[${n}].username`" :label="t('settings.messengers.username')" :maxlength="200" />
          <SettingInput
            :name="`messengers[${n}].password`"
            type="password"
            autocomplete="new-password"
            :label="t('settings.messengers.password')"
            :help="t('globals.messages.passwordChange')"
            :maxlength="200"
          />
        </div>
        <div class="grid items-start gap-6 md:grid-cols-3">
          <SettingNumber :name="`messengers[${n}].max_conns`" :label="t('settings.messengers.maxConns')" :help="t('settings.messengers.maxConnsHelp')" :min="1" :max="65535" />
          <SettingNumber :name="`messengers[${n}].max_msg_retries`" :label="t('settings.messengers.retries')" :help="t('settings.messengers.retriesHelp')" :min="1" :max="1000" />
          <SettingInput :name="`messengers[${n}].timeout`" :label="t('settings.messengers.timeout')" :help="t('settings.messengers.timeoutHelp')" placeholder="5s" :maxlength="10" />
        </div>
      </fieldset>
    </section>

    <Button type="button" data-cy="messenger-add" @click="add"><Plus />{{ t('globals.buttons.addNew') }}</Button>

    <ConfirmDialog
      v-model:open="removeOpen"
      destructive
      :title="t('globals.messages.confirm')"
      :confirm-label="t('globals.buttons.delete')"
      @confirm="remove"
    />
  </div>
</template>
