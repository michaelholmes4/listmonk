<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { Config } from '../model'

defineProps<{ errors: Record<string, string>; disabled?: boolean }>()
const config = defineModel<Config>({ required: true })
const { t } = useI18n()

type Kind = 'text' | 'number' | 'boolean'
const kind = computed<Kind>(() => (typeof config.value.value === 'number' ? 'number' : typeof config.value.value === 'boolean' ? 'boolean' : 'text'))
const patch = (p: Config) => (config.value = { ...config.value, ...p })

function setKind(k: Kind) {
  patch({ value: k === 'boolean' ? true : k === 'number' ? 0 : '' })
}
function setText(v: string) {
  patch({ value: kind.value === 'number' ? (v === '' || Number.isNaN(Number(v)) ? '' : Number(v)) : v })
}
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-2">
      <Label for="ua-attribute">{{ t('web.automations.attribute.name') }}</Label>
      <Input
        id="ua-attribute"
        :model-value="String(config.attribute ?? '')"
        placeholder="plan"
        :disabled="disabled"
        :aria-invalid="!!errors.attribute || undefined"
        @update:model-value="patch({ attribute: String($event) })"
      />
      <p v-if="errors.attribute" class="text-sm text-destructive">{{ errors.attribute }}</p>
      <p class="text-xs text-muted-foreground">{{ t('web.automations.attribute.help') }}</p>
    </div>

    <div class="flex items-center justify-between gap-4 rounded-lg border p-3">
      <Label for="ua-unset" class="font-normal">{{ t('web.automations.attribute.unset') }}</Label>
      <Switch
        id="ua-unset"
        :model-value="!!config.unset"
        :disabled="disabled"
        @update:model-value="patch($event ? { unset: true, value: undefined } : { unset: undefined, value: '' })"
      />
    </div>

    <div v-if="!config.unset" class="grid gap-4 sm:grid-cols-[10rem_1fr]">
      <div class="space-y-2">
        <Label>{{ t('web.automations.attribute.type') }}</Label>
        <Select :model-value="kind" :disabled="disabled" @update:model-value="setKind($event as Kind)">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="text">{{ t('web.automations.attribute.text') }}</SelectItem>
            <SelectItem value="number">{{ t('web.automations.attribute.number') }}</SelectItem>
            <SelectItem value="boolean">{{ t('web.automations.attribute.boolean') }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-2">
        <Label for="ua-value">{{ t('web.automations.attribute.value') }}</Label>
        <Select v-if="kind === 'boolean'" :model-value="String(config.value)" :disabled="disabled" @update:model-value="patch({ value: $event === 'true' })">
          <SelectTrigger id="ua-value" class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">{{ t('web.automations.attribute.true') }}</SelectItem>
            <SelectItem value="false">{{ t('web.automations.attribute.false') }}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-else
          id="ua-value"
          :type="kind === 'number' ? 'number' : 'text'"
          :model-value="config.value === undefined ? '' : String(config.value)"
          :disabled="disabled"
          :aria-invalid="!!errors.value || undefined"
          @update:model-value="setText(String($event))"
        />
        <p v-if="errors.value" class="text-sm text-destructive">{{ errors.value }}</p>
      </div>
    </div>
  </div>
</template>
