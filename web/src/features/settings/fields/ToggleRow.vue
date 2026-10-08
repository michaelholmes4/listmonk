<script setup lang="ts">
import { FormDescription } from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'

/** Switch with its label and help beside it; `v-model` is the on/off state. */
const props = defineProps<{ label: string; help?: string; disabled?: boolean; id?: string }>()
const on = defineModel<boolean>({ default: false })
const id = props.id ?? `sw-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <div class="flex flex-row items-start gap-3">
    <Switch :id="id" v-model="on" :disabled="disabled" class="mt-0.5" />
    <div class="space-y-0.5">
      <label :for="id" class="text-sm font-medium leading-snug">{{ label }}</label>
      <FormDescription v-if="help">{{ help }}</FormDescription>
    </div>
  </div>
</template>
