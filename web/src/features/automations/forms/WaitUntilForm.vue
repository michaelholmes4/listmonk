<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fromLocalInput, toLocalInput } from '@/features/campaigns/schema'
import type { Config } from '../model'
import DurationInput from './DurationInput.vue'

defineProps<{ errors: Record<string, string>; disabled?: boolean }>()
const config = defineModel<Config>({ required: true })
const { t } = useI18n()

// "A date" or "a date held in an attribute (optionally shifted)": exactly one is stored.
const mode = computed(() => (config.value.at !== undefined ? 'date' : 'attribute'))
function setMode(m: string) {
  config.value = m === 'date' ? { at: new Date(Date.now() + 86_400_000).toISOString() } : { attribute: '' }
}
const patch = (p: Config) => {
  const next: Config = { ...config.value, ...p }
  for (const k of Object.keys(next)) if (next[k] === '' || next[k] === undefined) delete next[k]
  config.value = next
}

const offset = computed(() => String(config.value.offset ?? ''))
const before = computed(() => offset.value.startsWith('-'))
const amount = computed(() => offset.value.replace(/^-/, ''))
const setOffset = (amt: string, neg: boolean) => patch({ offset: amt ? `${neg ? '-' : ''}${amt}` : '' })
</script>

<template>
  <div class="space-y-5">
    <RadioGroup :model-value="mode" class="gap-3" :disabled="disabled" @update:model-value="setMode(String($event))">
      <div class="flex items-center gap-2">
        <RadioGroupItem id="wu-date" value="date" />
        <Label for="wu-date">{{ t('web.automations.waitUntil.date') }}</Label>
      </div>
      <div class="flex items-center gap-2">
        <RadioGroupItem id="wu-attr" value="attribute" />
        <Label for="wu-attr">{{ t('web.automations.waitUntil.attribute') }}</Label>
      </div>
    </RadioGroup>

    <div v-if="mode === 'date'" class="space-y-2">
      <Label for="wu-at">{{ t('web.automations.waitUntil.at') }}</Label>
      <Input
        id="wu-at"
        type="datetime-local"
        :model-value="toLocalInput(config.at as string)"
        :disabled="disabled"
        @update:model-value="patch({ at: fromLocalInput(String($event)) ?? '' })"
      />
    </div>

    <template v-else>
      <div class="space-y-2">
        <Label for="wu-attribute">{{ t('web.automations.waitUntil.attributeName') }}</Label>
        <Input
          id="wu-attribute"
          :model-value="String(config.attribute ?? '')"
          placeholder="renewal_date"
          :disabled="disabled"
          :aria-invalid="!!errors.attribute || undefined"
          @update:model-value="patch({ attribute: String($event) })"
        />
        <p v-if="errors.attribute" class="text-sm text-destructive">{{ errors.attribute }}</p>
        <p class="text-xs text-muted-foreground">{{ t('web.automations.waitUntil.attributeHelp') }}</p>
      </div>
      <div class="space-y-2">
        <Label>{{ t('web.automations.waitUntil.shift') }}</Label>
        <div class="flex flex-wrap items-center gap-2">
          <DurationInput :model-value="amount" :disabled="disabled" :invalid="!!errors.offset" @update:model-value="setOffset($event, before)" />
          <Select :model-value="before ? 'before' : 'after'" :disabled="disabled" @update:model-value="setOffset(amount, $event === 'before')">
            <SelectTrigger class="w-40" :aria-label="t('web.automations.waitUntil.direction')"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="before">{{ t('web.automations.waitUntil.before') }}</SelectItem>
              <SelectItem value="after">{{ t('web.automations.waitUntil.after') }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p v-if="errors.offset" class="text-sm text-destructive">{{ errors.offset }}</p>
      </div>
    </template>
    <p v-if="errors.attribute && mode === 'date'" class="text-sm text-destructive">{{ errors.attribute }}</p>
  </div>
</template>
