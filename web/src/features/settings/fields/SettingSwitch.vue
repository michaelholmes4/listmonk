<script setup lang="ts">
import { FormField, FormItem } from '@/components/ui/form'
import ToggleRow from './ToggleRow.vue'

/** An on/off setting bound to a form path. */
const props = defineProps<{ name: string; label: string; help?: string; disabled?: boolean }>()
const id = `sw-${props.name.replace(/[^a-z0-9]+/gi, '-')}`
</script>

<template>
  <FormField v-slot="{ value, handleChange }" :name="name">
    <FormItem>
      <ToggleRow :id="id" :model-value="!!value" :label="label" :help="help" :disabled="disabled" @update:model-value="handleChange" />
    </FormItem>
  </FormField>
</template>
