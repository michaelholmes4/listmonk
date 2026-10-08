<script setup lang="ts">
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** A labelled select over string options; `nullable` adds a "none" entry that maps to null. */
const props = defineProps<{
  name: string
  label: string
  help?: string
  options: { value: string; label: string }[]
  disabled?: boolean
  nullable?: string
  /** The form holds a number (ids), not a string. */
  number?: boolean
}>()
const NONE = '__none__'
</script>

<template>
  <FormField v-slot="{ value, handleChange }" :name="name">
    <FormItem>
      <FormLabel>{{ label }}</FormLabel>
      <Select
        :model-value="value == null ? (nullable ? NONE : undefined) : String(value)"
        :disabled="disabled"
        @update:model-value="handleChange($event === NONE ? null : props.number ? Number($event) : $event)"
      >
        <FormControl><SelectTrigger class="w-full" :data-cy="name"><SelectValue /></SelectTrigger></FormControl>
        <SelectContent>
          <SelectItem v-if="nullable" :value="NONE">{{ nullable }}</SelectItem>
          <SelectItem v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</SelectItem>
        </SelectContent>
      </Select>
      <FormDescription v-if="help">{{ help }}</FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
