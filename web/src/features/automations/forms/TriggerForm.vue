<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ListSelect from '../ListSelect.vue'
import type { Config, TriggerType } from '../model'

const props = defineProps<{ type: TriggerType; errors: Record<string, string>; disabled?: boolean }>()
const config = defineModel<Config>({ required: true })
const { t } = useI18n()
const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
const patch = (p: Config) => {
  const next: Config = { ...config.value, ...p }
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k]
  config.value = next
}

// "Becomes" is compared as text unless it parses as a number or boolean, as a person would mean it.
const shown = () => (config.value.equals === undefined ? '' : typeof config.value.equals === 'string' ? config.value.equals : JSON.stringify(config.value.equals))
function setEquals(text: string) {
  if (text === '') return patch({ equals: undefined })
  if (text === 'true' || text === 'false') return patch({ equals: text === 'true' })
  if (!Number.isNaN(Number(text)) && text.trim() !== '') return patch({ equals: Number(text) })
  patch({ equals: text })
}
</script>

<template>
  <div class="space-y-5">
    <p class="text-sm text-muted-foreground">{{ t(`web.automations.trigger.${props.type}_help`) }}</p>

    <div v-if="props.type === 'list_joined'" class="space-y-2">
      <Label for="tr-list">{{ t('globals.terms.list', 1) }}</Label>
      <ListSelect id="tr-list" :model-value="num(config.list_id)" :invalid="!!errors.list_id" :disabled="disabled" @update:model-value="patch({ list_id: $event })" />
      <p v-if="errors.list_id" class="text-sm text-destructive">{{ errors.list_id }}</p>
    </div>

    <template v-else-if="props.type === 'attribute_changed'">
      <div class="space-y-2">
        <Label for="tr-attr">{{ t('web.automations.attribute.name') }}</Label>
        <Input id="tr-attr" :model-value="String(config.attribute ?? '')" placeholder="plan" :disabled="disabled" :aria-invalid="!!errors.attribute || undefined" @update:model-value="patch({ attribute: String($event) })" />
        <p v-if="errors.attribute" class="text-sm text-destructive">{{ errors.attribute }}</p>
      </div>
      <div class="space-y-2">
        <Label for="tr-equals">{{ t('web.automations.trigger.becomes') }}</Label>
        <Input id="tr-equals" :model-value="shown()" :disabled="disabled" @update:model-value="setEquals(String($event))" />
        <p class="text-xs text-muted-foreground">{{ t('web.automations.trigger.becomesHelp') }}</p>
      </div>
    </template>

    <div v-else-if="props.type === 'event'" class="space-y-2">
      <Label for="tr-event">{{ t('web.automations.trigger.eventName') }}</Label>
      <Input id="tr-event" :model-value="String(config.event ?? '')" placeholder="signed_up" :disabled="disabled" :aria-invalid="!!errors.event || undefined" @update:model-value="patch({ event: String($event) })" />
      <p v-if="errors.event" class="text-sm text-destructive">{{ errors.event }}</p>
      <p class="text-xs text-muted-foreground">{{ t('web.automations.trigger.eventHelp2') }}</p>
    </div>
  </div>
</template>
