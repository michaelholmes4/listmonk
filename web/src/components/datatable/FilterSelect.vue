<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * A toolbar filter that names what it filters ("Status: All"). `undefined` means no filter;
 * `allLabel` overrides the "All" entry.
 */
const props = defineProps<{ label: string; options: { value: string; label: string }[]; allLabel?: string }>()
const model = defineModel<string | undefined>()
const { t } = useI18n()

const ALL = '__all'
const value = computed({ get: () => model.value || ALL, set: (v) => (model.value = v === ALL ? undefined : v) })
const current = computed(() => props.options.find((o) => o.value === model.value)?.label ?? props.allLabel ?? t('web.common.all'))
</script>

<template>
  <Select v-model="value">
    <SelectTrigger size="sm" class="w-auto min-w-36" :aria-label="label">
      <SelectValue>
        <span class="text-muted-foreground">{{ label }}:</span> <span class="truncate">{{ current }}</span>
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem :value="ALL">{{ allLabel ?? t('web.common.all') }}</SelectItem>
      <SelectItem v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</SelectItem>
    </SelectContent>
  </Select>
</template>
