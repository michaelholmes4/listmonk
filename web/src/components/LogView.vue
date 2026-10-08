<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { cn } from '@/lib/utils'

/** Read-only monospace log that sticks to the bottom as lines arrive. */
const props = defineProps<{ lines: string[]; class?: string }>()
const el = ref<HTMLElement>()

watch(
  () => props.lines.length,
  async () => {
    await nextTick()
    if (el.value) el.value.scrollTop = el.value.scrollHeight
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <pre ref="el" :class="cn('box max-h-64 overflow-auto bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap', props.class)" data-cy="log"><template v-for="(l, i) in lines" :key="i">{{ l }}
</template></pre>
</template>
