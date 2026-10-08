<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Shows server-rendered HTML (a template or campaign preview) in a sandboxed iframe. The HTML
 * may contain scripts from the user's own template; `sandbox="allow-scripts"` without
 * `allow-same-origin` keeps them away from the admin session.
 */
defineProps<{ title: string; html?: string | null; pending?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex h-[85vh] flex-col sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription class="sr-only">{{ title }}</DialogDescription>
      </DialogHeader>
      <Skeleton v-if="pending" class="min-h-0 flex-1" />
      <iframe
        v-else-if="html != null"
        :srcdoc="html"
        :title="title"
        sandbox="allow-scripts"
        class="box min-h-0 w-full flex-1 bg-white"
        data-cy="preview-frame"
      />
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('globals.buttons.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
