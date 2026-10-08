<script setup lang="ts">
import { FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { TagsInput, TagsInputInput, TagsInputItem, TagsInputItemDelete, TagsInputItemText } from '@/components/ui/tags-input'

/** A list of short strings. `accept` filters what can be added (return false to refuse). */
defineProps<{ name: string; label: string; help?: string; placeholder?: string; accept?: (v: string) => boolean; disabled?: boolean }>()
</script>

<template>
  <FormField v-slot="{ value, handleChange }" :name="name">
    <FormItem>
      <FormLabel>{{ label }}</FormLabel>
      <TagsInput
        :model-value="(value as string[] | undefined) ?? []"
        :disabled="disabled"
        add-on-blur
        add-on-paste
        :convert-value="(v: string) => v.trim()"
        @update:model-value="(list) => handleChange((list as string[]).filter((v) => v && (accept ? accept(v) : true)))"
      >
        <TagsInputItem v-for="tag in (value as string[] | undefined) ?? []" :key="tag" :value="tag">
          <TagsInputItemText />
          <TagsInputItemDelete />
        </TagsInputItem>
        <TagsInputInput :placeholder="placeholder" :aria-label="label" />
      </TagsInput>
      <FormDescription v-if="help">{{ help }}</FormDescription>
    </FormItem>
  </FormField>
</template>
