<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MediaFile } from '@/api/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import MediaBrowser from './MediaBrowser.vue'

/** Pick a file from the media library (image for the editors, attachment for a campaign). */
const emit = defineEmits<{ select: [file: MediaFile] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const search = ref('')
const page = ref(1)
// A fresh search each time it opens.
watch(open, (o) => {
  if (o) {
    search.value = ''
    page.value = 1
  }
})

function pick(f: MediaFile) {
  emit('select', f)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>{{ t('media.title') }}</DialogTitle>
        <DialogDescription class="sr-only">{{ t('media.title') }}</DialogDescription>
      </DialogHeader>
      <MediaBrowser v-model:search="search" v-model:page="page" selectable @select="pick" />
    </DialogContent>
  </Dialog>
</template>
