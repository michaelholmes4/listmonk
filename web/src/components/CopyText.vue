<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import { useClipboard } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

/** Inline text with a copy-to-clipboard button. */
const props = defineProps<{ text: string }>()
const { t } = useI18n()
const { copy, copied } = useClipboard({ source: () => props.text, copiedDuring: 1500 })
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <slot>{{ text }}</slot>
    <button
      type="button"
      class="rounded p-0.5 text-muted-foreground hover:text-foreground"
      :aria-label="t('web.common.copy')"
      @click.stop="copy(text)"
    >
      <Check v-if="copied" class="size-3.5" />
      <Copy v-else class="size-3.5" />
    </button>
  </span>
</template>
