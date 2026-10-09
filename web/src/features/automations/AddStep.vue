!(isBranching(s) || s === 'exit') || props.index >= props.list.length<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useBuilder } from './context'
import { stepMeta } from './labels'
import { isBranching, stepTypes, type Step, type StepType } from './model'

/** The "+" between steps: a menu of what can go at this spot. */
const props = defineProps<{ list: Step[]; index: number }>()
const { t } = useI18n()
const b = useBuilder()
const open = ref(false)

// A branching step, an exit or a go to ends its list, so it can only go last.
const types = computed(() => stepTypes.filter((s) => !(isBranching(s) || s === 'exit' || s === 'go_to') || props.index >= props.list.length))

function choose(type: StepType) {
  open.value = false
  b.add(props.list, props.index, type)
}
</script>

<template>
  <Popover v-if="!b.readonly.value" v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        size="icon-sm"
        class="size-6 rounded-full bg-background"
        :aria-label="t('web.automations.addStep')"
        data-cy="add-step"
      >
        <Plus class="size-3.5" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="max-h-80 w-72 overflow-y-auto p-1" align="center" :collision-padding="8">
      <button
        v-for="s in types"
        :key="s"
        type="button"
        class="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        :data-cy="`add-${s}`"
        @click="choose(s)"
      >
        <component :is="stepMeta[s].icon" class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span class="space-y-0.5">
          <span class="block text-sm font-medium">{{ t(stepMeta[s].title) }}</span>
          <span class="block text-xs text-muted-foreground">{{ t(stepMeta[s].help) }}</span>
        </span>
      </button>
    </PopoverContent>
  </Popover>
</template>
