<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** A length of time as "30m", "2h", "3d" or "1w": a number and a unit. Empty when unset. */
defineProps<{ id?: string; invalid?: boolean; disabled?: boolean }>()
const model = defineModel<string>({ default: '' })
const { t } = useI18n()

const units = ['m', 'h', 'd', 'w'] as const
const parts = computed(() => {
  const m = /^(\d*)([smhdw])$/.exec(model.value)
  return { n: m?.[1] ?? '', unit: (m?.[2] ?? 'd') as string }
})
const set = (n: string, unit: string) => (model.value = n === '' ? '' : `${n}${unit}`)
</script>

<template>
  <div class="flex gap-2">
    <Input
      :id="id"
      type="number"
      min="1"
      inputmode="numeric"
      class="w-24"
      :model-value="parts.n"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      @update:model-value="set(String($event ?? '').replace(/\D/g, ''), parts.unit)"
    />
    <Select :model-value="parts.unit" :disabled="disabled" @update:model-value="set(parts.n || '1', String($event))">
      <SelectTrigger class="w-32" :aria-label="t('web.automations.unit')"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="u in units" :key="u" :value="u">
          {{ t(`web.automations.unitName.${u}`) }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
