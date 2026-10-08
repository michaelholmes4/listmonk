<script setup lang="ts">
import { FileUp, X } from '@lucide/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Click-or-drop file picker for one file. `v-model` is the chosen File (or null). */
const props = withDefaults(defineProps<{ accept?: string; label: string; disabled?: boolean }>(), {
  accept: undefined,
  disabled: false,
})
const file = defineModel<File | null>({ default: null })

const { t } = useI18n()
const input = ref<HTMLInputElement>()
const over = ref(false)

function pick(files: FileList | null | undefined) {
  if (files?.length) file.value = files[0]
}
function onDrop(e: DragEvent) {
  over.value = false
  pick(e.dataTransfer?.files)
}
function clear() {
  file.value = null
  if (input.value) input.value.value = ''
}
</script>

<template>
  <div class="space-y-2">
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
      <input ref="input" type="file" class="sr-only" :accept="accept" :disabled="props.disabled" @change="pick(($event.target as HTMLInputElement).files)" />
    </label>
    <div v-if="file" class="flex items-center gap-2 text-sm">
      <span class="truncate font-medium">{{ file.name }}</span>
      <Button type="button" variant="ghost" size="icon-xs" :aria-label="t('globals.buttons.remove')" @click="clear"><X /></Button>
    </div>
  </div>
</template>
