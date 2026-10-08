<script setup lang="ts">
import { FileUp } from '@lucide/vue'
import { ref } from 'vue'
import { cn } from '@/lib/utils'

/**
 * Click-or-drop area. Emits the chosen files; the parent decides how to show and keep them
 * (a single chip for an import, a list for a multi-upload).
 */
const props = withDefaults(defineProps<{ accept?: string; label: string; multiple?: boolean; disabled?: boolean }>(), {
  accept: undefined,
  multiple: false,
  disabled: false,
})
const emit = defineEmits<{ select: [files: File[]] }>()

const input = ref<HTMLInputElement>()
const over = ref(false)

function pick(list: FileList | null | undefined) {
  const files = [...(list ?? [])]
  if (files.length) emit('select', props.multiple ? files : files.slice(0, 1))
  // Picking the same file twice in a row must still fire a change.
  if (input.value) input.value.value = ''
}
function onDrop(e: DragEvent) {
  over.value = false
  pick(e.dataTransfer?.files)
}
</script>

<template>
  <label
    :class="
      cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50',
        over && 'border-primary bg-muted/50',
        props.disabled && 'pointer-events-none opacity-50',
      )
    "
    @dragover.prevent="over = true"
    @dragleave.prevent="over = false"
    @drop.prevent="onDrop"
  >
    <FileUp class="size-8" />
    <span>{{ label }}</span>
    <input
      ref="input"
      type="file"
      class="sr-only"
      :accept="accept"
      :multiple="multiple"
      :disabled="props.disabled"
      @change="pick(($event.target as HTMLInputElement).files)"
    />
  </label>
</template>
