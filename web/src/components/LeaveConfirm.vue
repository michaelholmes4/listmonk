<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

/** "Discard changes?" for `useUnsavedGuard`. */
defineProps<{ open: boolean }>()
const emit = defineEmits<{ decide: [ok: boolean] }>()
const { t } = useI18n()
</script>

<template>
  <ConfirmDialog
    :open="open"
    :title="t('globals.messages.confirmDiscard')"
    :confirm-label="t('web.common.discard')"
    destructive
    @update:open="(o: boolean) => !o && emit('decide', false)"
    @confirm="emit('decide', true)"
  />
</template>
