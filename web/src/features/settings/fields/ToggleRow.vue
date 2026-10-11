<script setup lang="ts">
import { FormDescription } from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'

/** An on/off row like the other editors' (label and help on the left, switch on the right); `v-model` is the state. */
const props = defineProps<{ label: string; help?: string; disabled?: boolean; id?: string }>()
const on = defineModel<boolean>({ default: false })
const id = props.id ?? `sw-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <div class="flex items-start justify-between gap-4 rounded-lg border p-3">
    <div class="min-w-0 space-y-0.5">
      <label :for="id" class="text-sm font-medium leading-snug">{{ label }}</label>
      <FormDescription v-if="help">{{ help }}</FormDescription>
    </div>
    <Switch :id="id" v-model="on" :disabled="disabled" />
  </div>
</template>
