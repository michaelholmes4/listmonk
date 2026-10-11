<script setup lang="ts">
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'

/** A labelled text input bound to a form path, with optional help text. `short` sizes it for a duration or a cron line. */
defineProps<{
  name: string
  label: string
  help?: string
  type?: string
  placeholder?: string
  maxlength?: number
  disabled?: boolean
  autocomplete?: string
  short?: boolean
}>()
</script>

<template>
  <FormField v-slot="{ componentField }" :name="name">
    <FormItem>
      <FormLabel>{{ label }}</FormLabel>
      <FormControl>
        <Input
          v-bind="componentField"
          :type="type ?? 'text'"
          :placeholder="placeholder"
          :maxlength="maxlength ?? 300"
          :disabled="disabled"
          :autocomplete="autocomplete ?? 'off'"
          :class="short && 'w-40'"
        />
      </FormControl>
      <FormDescription v-if="help">{{ help }}</FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
