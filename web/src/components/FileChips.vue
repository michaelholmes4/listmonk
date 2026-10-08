<script setup lang="ts">
import { X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'

/** The files picked so far, each removable. */
defineProps<{ files: File[] }>()
const emit = defineEmits<{ remove: [index: number] }>()
const { t } = useI18n()
</script>

<template>
  <div v-if="files.length" class="flex flex-wrap gap-1.5">
    <Badge v-for="(f, i) in files" :key="`${f.name}-${i}`" variant="secondary" class="gap-1 pr-1">
      <span class="max-w-60 truncate">{{ f.name }}</span>
      <button
        type="button"
        class="rounded-full p-0.5 hover:bg-foreground/10"
        :aria-label="t('globals.buttons.remove')"
        @click="emit('remove', i)"
      >
        <X class="size-3" />
      </button>
    </Badge>
  </div>
</template>
