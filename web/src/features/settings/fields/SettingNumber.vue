<script setup lang="ts">
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'

/** A numeric input; the form holds a number (or undefined while the box is empty). */
defineProps<{ name: string; label: string; help?: string; min?: number; max?: number; placeholder?: string; disabled?: boolean }>()
</script>

<template>
  <FormField v-slot="{ value, handleChange, handleBlur }" :name="name">
    <FormItem>
      <FormLabel>{{ label }}</FormLabel>
      <FormControl>
        <Input
          type="number"
          inputmode="numeric"
          :model-value="value"
          :min="min"
          :max="max"
          :placeholder="placeholder"
          :disabled="disabled"
          @update:model-value="handleChange($event === '' ? undefined : Number($event))"
          @blur="handleBlur"
        />
      </FormControl>
      <FormDescription v-if="help">{{ help }}</FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
