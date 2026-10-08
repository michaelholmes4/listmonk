<script setup lang="ts">
import { format } from 'date-fns'
import { Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { MediaFile } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Grid of uploaded files. With `selectable` (the picker inside the campaign editor) a click
 * emits `select` instead of opening the file; otherwise the thumbnail links to the file.
 */
defineProps<{ items: MediaFile[]; loading?: boolean; selectable?: boolean; canDelete?: boolean }>()
const emit = defineEmits<{ select: [file: MediaFile]; delete: [file: MediaFile] }>()
const { t } = useI18n()

const ext = (name?: string) => (name?.includes('.') ? name.split('.').pop()!.toUpperCase() : '')
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4" data-cy="media-grid">
    <template v-if="loading">
      <div v-for="i in 8" :key="i" class="space-y-2">
        <Skeleton class="aspect-square w-full" />
        <Skeleton class="h-4 w-2/3" />
      </div>
    </template>

    <template v-else>
      <div v-for="m in items" :key="m.id" class="group relative space-y-1.5" data-cy="media-item">
        <a
          :href="m.url"
          target="_blank"
          rel="noopener noreferrer"
          class="box block aspect-square overflow-hidden bg-muted/30"
          @click="selectable && ($event.preventDefault(), emit('select', m))"
        >
          <img v-if="m.thumb_url" :src="m.thumb_url" :alt="m.filename" class="size-full object-cover" loading="lazy" />
          <span v-else class="grid size-full place-items-center text-sm font-medium text-muted-foreground">{{ ext(m.filename) }}</span>
        </a>
        <Button
          v-if="canDelete"
          type="button"
          variant="secondary"
          size="icon-xs"
          class="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          :aria-label="`${t('globals.buttons.delete')} ${m.filename}`"
          @click="emit('delete', m)"
        >
          <Trash2 />
        </Button>
        <p class="truncate text-sm" :title="m.filename">{{ m.filename }}</p>
        <p class="text-xs text-muted-foreground">{{ m.created_at ? format(new Date(m.created_at), 'PP') : '' }}</p>
      </div>
    </template>
  </div>
</template>
