<script setup lang="ts">
import type { Flow } from './model'
import StepPanel from './StepPanel.vue'
import type { useStepPanel } from './useStepPanel'

/**
 * The step panel docked beside the flow (from `lg` up). It blocks nothing: no overlay, and the flow
 * stays clickable. It sticks below the page header and fills the rest of the screen (Page sets
 * `--page-header-h` and `--page-viewport-h`).
 */
defineProps<{ flow: Flow; panel: ReturnType<typeof useStepPanel>; readonly: boolean; saving?: boolean }>()
defineEmits<{ close: []; remove: [] }>()
</script>

<template>
  <aside
    class="sticky top-(--page-header-h) -mr-4 h-[calc(var(--page-viewport-h)-var(--page-header-h))] w-[28rem] shrink-0 border-l bg-background sm:-mr-6"
    data-cy="step-sheet"
  >
    <StepPanel :flow="flow" :panel="panel" :readonly="readonly" :saving="saving" @close="$emit('close')" @remove="$emit('remove')" />
  </aside>
</template>
