<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { ImportParams } from '@/api/import'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FileDropzone from '@/components/FileDropzone.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { useStartImport } from '@/composables/queries/useImport'
import ListPicker from '@/features/lists/ListPicker.vue'

/** Initial list selection, e.g. from "Import" on a list row (?list_id=1&list_id=2). */
const props = defineProps<{ initialLists?: number[] }>()

const { t } = useI18n()
const start = useStartImport()

const mode = ref<ImportParams['mode']>('subscribe')
const subStatus = ref<ImportParams['subscriptionStatus']>('unconfirmed')
const delim = ref(',')
const overwriteUserInfo = ref(false)
const overwriteSubStatus = ref(false)
const listIds = ref<number[]>([...(props.initialLists ?? [])])
const file = ref<File | null>(null)
const confirmOpen = ref(false)

// Each mode has its own sensible default status.
watch(mode, (m) => (subStatus.value = m === 'subscribe' ? 'unconfirmed' : 'unsubscribed'))

const subscribing = computed(() => mode.value === 'subscribe')
const canSubmit = computed(
  () => !!file.value && delim.value.length === 1 && (!subscribing.value || listIds.value.length > 0),
)

function submit() {
  // Overwriting statuses re-subscribes people who unsubscribed: make that a deliberate step.
  if (subscribing.value && overwriteSubStatus.value) confirmOpen.value = true
  else run()
}

function run() {
  start.mutate(
    {
      file: file.value!,
      params: {
        mode: mode.value,
        subscriptionStatus: subStatus.value,
        delim: delim.value,
        listIds: subscribing.value ? listIds.value : [],
        overwriteUserInfo: subscribing.value && overwriteUserInfo.value,
        overwriteSubStatus: subscribing.value && overwriteSubStatus.value,
      },
    },
    {
      onSuccess: () => {
        toast.success(t('import.importStarted'))
        confirmOpen.value = false
      },
      onError: () => {
        // The server may have rejected the file; don't keep re-sending the same one.
        file.value = null
        confirmOpen.value = false
      },
    },
  )
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="submit">
    <div class="grid items-start gap-6 md:grid-cols-3">
      <div class="space-y-2">
        <Label>{{ t('import.mode') }}</Label>
        <RadioGroup v-model="mode">
          <div class="flex items-center gap-2">
            <RadioGroupItem id="import-subscribe" value="subscribe" />
            <Label for="import-subscribe">{{ t('import.subscribe') }}</Label>
          </div>
          <div class="flex items-center gap-2">
            <RadioGroupItem id="import-blocklist" value="blocklist" />
            <Label for="import-blocklist">{{ t('import.blocklist') }}</Label>
          </div>
        </RadioGroup>
      </div>

      <div class="space-y-2">
        <Label>{{ t('globals.fields.status') }}</Label>
        <RadioGroup v-if="subscribing" v-model="subStatus">
          <div v-for="s in ['unconfirmed', 'confirmed']" :key="s" class="flex items-center gap-2">
            <RadioGroupItem :id="`import-status-${s}`" :value="s" />
            <Label :for="`import-status-${s}`">{{ t(`subscribers.status.${s}`) }}</Label>
          </div>
        </RadioGroup>
        <RadioGroup v-else v-model="subStatus">
          <div class="flex items-center gap-2">
            <RadioGroupItem id="import-status-unsubscribed" value="unsubscribed" />
            <Label for="import-status-unsubscribed">{{ t('subscribers.status.unsubscribed') }}</Label>
          </div>
        </RadioGroup>
      </div>

      <div class="space-y-2">
        <Label for="import-delim">{{ t('import.csvDelim') }}</Label>
        <Input id="import-delim" v-model="delim" maxlength="1" placeholder="," class="w-20" required />
        <p class="text-sm text-muted-foreground">{{ t('import.csvDelimHelp') }}</p>
      </div>
    </div>

    <template v-if="subscribing">
      <div class="grid items-start gap-6 md:grid-cols-2">
        <div class="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div class="space-y-0.5">
            <Label for="import-overwrite-info">{{ t('import.overwriteUserInfo') }}</Label>
            <p class="text-xs text-muted-foreground">{{ t('import.overwriteUserInfoHelp') }}</p>
          </div>
          <Switch id="import-overwrite-info" v-model="overwriteUserInfo" />
        </div>
        <div class="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div class="space-y-0.5">
            <Label for="import-overwrite-status">{{ t('import.overwriteSubStatus') }}</Label>
            <p class="text-xs text-muted-foreground">{{ t('import.overwriteSubStatusHelp') }}</p>
          </div>
          <Switch id="import-overwrite-status" v-model="overwriteSubStatus" />
        </div>
      </div>

      <div class="space-y-2">
        <Label>{{ t('globals.terms.lists') }}</Label>
        <ListPicker v-model="listIds" :placeholder="t('import.listSubHelp')" />
      </div>
    </template>

    <div class="space-y-2">
      <Label>{{ t('import.csvFile') }}</Label>
      <FileDropzone v-model="file" accept=".csv,.zip" :label="t('import.csvFileHelp')" />
    </div>

    <Button type="submit" :disabled="!canSubmit || start.isPending.value">
      <Loader2 v-if="start.isPending.value" class="animate-spin" />
      {{ t('import.upload') }}
    </Button>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="t('import.overwriteSubStatus')"
      :description="t('import.subscribeWarning')"
      :pending="start.isPending.value"
      @confirm="run"
    />
  </form>
</template>
