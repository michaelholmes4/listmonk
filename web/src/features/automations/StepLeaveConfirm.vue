<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

/** Asked when the step panel has unsaved edits and the user is about to leave it. */
defineProps<{ open: boolean; name: string }>()
const emit = defineEmits<{ decide: [choice: 'save' | 'discard' | 'keep'] }>()
const { t } = useI18n()
</script>

<template>
  <AlertDialog :open="open" @update:open="(o: boolean) => !o && emit('decide', 'keep')">
    <AlertDialogContent data-cy="step-leave">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('web.automations.panel.leaveTitle', { name }) }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('web.automations.panel.leaveHelp') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-cy="step-leave-keep">{{ t('web.automations.panel.keepEditing') }}</AlertDialogCancel>
        <Button variant="outline" data-cy="step-leave-discard" @click="emit('decide', 'discard')">{{ t('web.automations.panel.discard') }}</Button>
        <Button data-cy="step-leave-save" @click="emit('decide', 'save')">{{ t('globals.buttons.save') }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
