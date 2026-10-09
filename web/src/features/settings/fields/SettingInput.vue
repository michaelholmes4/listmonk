<script setup lang="ts">
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'

/** A labelled text input bound to a form path, with optional help text. */
defineProps<{
  name: string
  label: string
  help?: string
  type?: string
  placeholder?: string
  maxlength?: number
  disabled?: boolean
  autocomplete?: string
}>()
</script>

<template>
  <FormField v-slot="{ componentField }" :name="name">
    <!-- A lone text field stays at a readable width, like FormSection's fields column; grids size their own cells. -->
    <FormItem class="max-w-xl">
      <FormLabel>{{ label }}</FormLabel>
      <FormControl>
        <Input
          v-bind="componentField"
          :type="type ?? 'text'"
          :placeholder="placeholder"
          :maxlength="maxlength ?? 300"
          :disabled="disabled"
          :autocomplete="autocomplete ?? 'off'"
        />
      </FormControl>
      <FormDescription v-if="help">{{ help }}</FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
