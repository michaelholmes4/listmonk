<script setup lang="ts">
import { computed } from 'vue'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import type { Flow } from './model'
import StepPanel from './StepPanel.vue'
import type { useStepPanel } from './useStepPanel'

/** The step panel in a side sheet, for screens too narrow to dock it (see StepInspector). */
const props = defineProps<{ flow: Flow; panel: ReturnType<typeof useStepPanel>; readonly: boolean; saving?: boolean }>()
const emit = defineEmits<{ close: []; remove: [] }>()

const open = computed({ get: () => !!props.panel.subject.value, set: (o) => !o && emit('close') })
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      class="w-full gap-0 data-[side=right]:sm:max-w-lg"
      :show-close-button="false"
      data-cy="step-sheet"
    >
      <StepPanel
        :flow="flow"
        :panel="panel"
        :readonly="readonly"
        :saving="saving"
        :title-as="SheetTitle"
        :description-as="SheetDescription"
        @close="emit('close')"
        @remove="emit('remove')"
      />
    </SheetContent>
  </Sheet>
</template>
