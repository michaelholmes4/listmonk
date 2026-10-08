<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAllLists } from '@/composables/queries/useLists'

/** One list, by id. */
defineProps<{ disabled?: boolean; invalid?: boolean; id?: string }>()
const model = defineModel<number | undefined>()
const { t } = useI18n()
const { data: lists, isPending } = useAllLists()
</script>

<template>
  <Skeleton v-if="isPending" class="h-9 w-full" />
  <Select
    v-else
    :model-value="model ? String(model) : undefined"
    :disabled="disabled"
    @update:model-value="model = Number($event)"
  >
    <SelectTrigger :id="id" class="w-full" :aria-invalid="invalid || undefined">
      <SelectValue :placeholder="t('web.automations.chooseList')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="l in lists" :key="l.id" :value="String(l.id)">{{ l.name }}</SelectItem>
    </SelectContent>
  </Select>
</template>
