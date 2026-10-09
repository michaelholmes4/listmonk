<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AutomationNodeStat } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAllLists } from '@/composables/queries/useLists'
import { provideBuilder } from './context'
import { triggerMeta } from './labels'
import { insertStep, locate, moveStep, newId, newStep, removeStep, syncBranches, triggerTypes, type Config, type Flow, type StepType, type Trigger, type TriggerType } from './model'
import StepList from './StepList.vue'
import StepSheet from './StepSheet.vue'
import TriggerCard from './TriggerCard.vue'
import { flowIssues } from './validate'
import { usePermission } from '@/composables/usePermission'

/**
 * The visual editor: the triggers, then the steps as a vertical list (a condition forks into
 * two). It edits `flow` in place and reports `change`; saving is the page's business.
 */
const props = defineProps<{
  flow: Flow
  readonly: boolean
  stats?: AutomationNodeStat[]
  /** Server-reported problems, by step id. */
  problems?: Map<string, string[]>
}>()
const emit = defineEmits<{ change: [] }>()
const { t } = useI18n()
const { can } = usePermission()
const { data: lists } = useAllLists()

const issues = computed(() => flowIssues(props.flow, can('subscribers:sql_query')))
const stats = computed(() => new Map((props.stats ?? []).map((s) => [s.node_id!, s])))
const serverProblems = computed(() => props.problems ?? new Map<string, string[]>())

const target = ref<{ kind: 'step' | 'trigger'; id: string } | null>(null)

provideBuilder({
  readonly: computed(() => props.readonly),
  stats,
  issues,
  problems: serverProblems,
  lookups: { list: (id) => lists.value?.find((l) => l.id === id)?.name },
  add(list, index, type: StepType) {
    const s = newStep(props.flow, type)
    if (!insertStep(list, index, s)) return
    emit('change')
    // A new step with settings opens straight away; the others are complete as they are.
    if (type !== 'condition' && type !== 'exit') target.value = { kind: 'step', id: s.id }
  },
  open: (id) => (target.value = { kind: 'step', id }),
  remove(id) {
    if (target.value?.id === id) target.value = null
    if (removeStep(props.flow, id)) emit('change')
  },
  move(id, dir) {
    if (moveStep(props.flow, id, dir)) emit('change')
  },
})

function apply(id: string, config: Config) {
  const loc = locate(props.flow, id)
  const step = loc?.list[loc.index]
  const trigger = props.flow.triggers.find((x) => x.id === id)
  if (step) {
    step.config = config
    syncBranches(step)
  } else if (trigger) trigger.config = config
  else return
  emit('change')
}

// --- Triggers ---------------------------------------------------------------------------------------------
const triggerOpen = ref(false)
function addTrigger(type: TriggerType) {
  triggerOpen.value = false
  const tr: Trigger = { id: newId(props.flow, 't'), type, config: {} }
  // eslint-disable-next-line vue/no-mutating-props -- the flow is one editable document, owned by the page
  props.flow.triggers.push(tr)
  emit('change')
  if (type !== 'manual') target.value = { kind: 'trigger', id: tr.id }
}
function removeTrigger(id: string) {
  const i = props.flow.triggers.findIndex((x) => x.id === id)
  if (i < 0) return
  if (target.value?.id === id) target.value = null
  // eslint-disable-next-line vue/no-mutating-props -- see addTrigger
  props.flow.triggers.splice(i, 1)
  emit('change')
}
</script>

<template>
  <div class="flex flex-col items-center gap-2 py-2" data-cy="builder">
    <TriggerCard v-for="tr in flow.triggers" :key="tr.id" :trigger="tr" @remove="removeTrigger(tr.id)" />
    <p v-if="flow.triggers.length > 1" class="text-xs text-muted-foreground">{{ t('web.automations.triggersAny') }}</p>

    <Popover v-if="!readonly" v-model:open="triggerOpen">
      <PopoverTrigger as-child>
        <Button variant="outline" size="sm" data-cy="add-trigger"><Plus />{{ t('web.automations.addTrigger') }}</Button>
      </PopoverTrigger>
      <PopoverContent class="max-h-80 w-72 overflow-y-auto p-1" align="center" :collision-padding="8">
        <button
          v-for="x in triggerTypes"
          :key="x"
          type="button"
          class="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          :data-cy="`add-trigger-${x}`"
          @click="addTrigger(x)"
        >
          <component :is="triggerMeta[x].icon" class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span class="space-y-0.5">
            <span class="block text-sm font-medium">{{ t(triggerMeta[x].title) }}</span>
            <span class="block text-xs text-muted-foreground">{{ t(triggerMeta[x].help) }}</span>
          </span>
        </button>
      </PopoverContent>
    </Popover>

    <StepList :steps="flow.steps" />
  </div>

  <StepSheet :flow="flow" :target="target" :readonly="readonly" @apply="apply" @close="target = null" />
</template>
