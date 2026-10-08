<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ListSelect from '../ListSelect.vue'
import type { Config } from '../model'

const props = defineProps<{ type: 'add_to_list' | 'remove_from_list'; errors: Record<string, string>; disabled?: boolean }>()
const config = defineModel<Config>({ required: true })
const { t } = useI18n()
const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
const patch = (p: Config) => {
  const next: Config = { ...config.value, ...p }
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k]
  config.value = next
}
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-2">
      <Label for="ls-list">{{ t('globals.terms.list', 1) }}</Label>
      <ListSelect id="ls-list" :model-value="num(config.list_id)" :invalid="!!errors.list_id" :disabled="disabled" @update:model-value="patch({ list_id: $event })" />
      <p v-if="errors.list_id" class="text-sm text-destructive">{{ errors.list_id }}</p>
    </div>
    <div v-if="props.type === 'add_to_list'" class="space-y-2">
      <Label>{{ t('globals.fields.status') }}</Label>
      <Select :model-value="String(config.status ?? 'default')" :disabled="disabled" @update:model-value="patch({ status: $event === 'default' ? undefined : String($event) })">
        <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="default">{{ t('web.automations.addToList.default') }}</SelectItem>
          <SelectItem value="confirmed">{{ t('subscribers.status.confirmed') }}</SelectItem>
          <SelectItem value="unconfirmed">{{ t('subscribers.status.unconfirmed') }}</SelectItem>
        </SelectContent>
      </Select>
      <p class="text-xs text-muted-foreground">{{ t('web.automations.addToList.help') }}</p>
    </div>
  </div>
</template>
