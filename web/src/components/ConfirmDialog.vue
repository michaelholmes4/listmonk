<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
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

/**
 * Confirmation for destructive or bulk actions. The parent owns the mutation: keep the dialog
 * open while it is `pending` and close it (`v-model:open`) from the mutation's onSuccess.
 */
withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmLabel?: string
    pending?: boolean
    destructive?: boolean
  }>(),
  { description: undefined, confirmLabel: undefined, pending: false, destructive: false },
)
const emit = defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="description">{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="pending">{{ t('globals.buttons.cancel') }}</AlertDialogCancel>
        <!-- A plain Button, not AlertDialogAction: that one closes the dialog before the mutation ends. -->
        <Button :variant="destructive ? 'destructive' : 'default'" :disabled="pending" @click="emit('confirm')">
          <Loader2 v-if="pending" class="animate-spin" />
          {{ confirmLabel ?? t('web.common.confirm') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
