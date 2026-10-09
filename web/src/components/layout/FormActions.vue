<script setup lang="ts">
import { Loader2, Save } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'

/**
 * A form's Save and Cancel, rendered into the page header (Page's `#page-actions`) so every
 * editor saves from the same place. Shows "Unsaved changes" while `dirty`. Extra buttons (Start,
 * Publish...) go in the default slot, after Save.
 *
 * `dirty` is optional: forms that don't track it leave Save always enabled.
 */
const props = withDefaults(
  defineProps<{
    pending?: boolean
    dirty?: boolean
    /** Hide Save (read-only users); Cancel then reads "Close". */
    canSave?: boolean
    saveLabel?: string
    /** Omit to hide the Cancel button. */
    onCancel?: () => void
  }>(),
  { pending: false, dirty: undefined, canSave: true, saveLabel: undefined, onCancel: undefined },
)
const emit = defineEmits<{ save: [] }>()
const { t } = useI18n()
</script>

<template>
  <Teleport defer to="#page-actions">
    <span v-if="canSave && props.dirty" class="flex items-center gap-1.5 text-xs text-muted-foreground" data-cy="unsaved">
      <span class="size-1.5 rounded-full bg-warning" aria-hidden="true" />{{ t('web.common.unsaved') }}
    </span>
    <Button v-if="onCancel" type="button" variant="outline" size="sm" @click="onCancel">
      {{ canSave ? t('globals.buttons.cancel') : t('globals.buttons.close') }}
    </Button>
    <Button
      v-if="canSave"
      type="button"
      size="sm"
      :variant="$slots.default ? 'outline' : 'default'"
      :disabled="pending || props.dirty === false"
      data-cy="btn-save"
      @click="emit('save')"
    >
      <Loader2 v-if="pending" class="animate-spin" /><Save v-else />{{ saveLabel ?? t('globals.buttons.save') }}
    </Button>
    <slot />
  </Teleport>
</template>
