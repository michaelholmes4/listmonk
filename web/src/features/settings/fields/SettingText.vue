<script setup lang="ts">
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'

/** A multi-line text setting (one entry per line). */
defineProps<{ name: string; label?: string; help?: string; placeholder?: string; rows?: number; disabled?: boolean }>()
</script>

<template>
  <FormField v-slot="{ componentField }" :name="name">
    <FormItem>
      <FormLabel v-if="label">{{ label }}</FormLabel>
      <FormControl><Textarea v-bind="componentField" :rows="rows ?? 5" :placeholder="placeholder" :disabled="disabled" class="font-mono text-sm" /></FormControl>
      <FormDescription v-if="help">{{ help }}</FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
