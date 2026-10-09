<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { AutomationNodeStat } from '@/api/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAllLists } from '@/composables/queries/useLists'
import { provideBuilder } from './context'
import { stepMeta, triggerMeta } from './labels'
import { hasSettings, insertStep, jumpsInto, locate, moveStep, newId, newStep, removeStep, triggerTypes, type Flow, type StepType, type Trigger, type TriggerType } from './model'
import StepList from './StepList.vue'
import StepInspector from './StepInspector.vue'
import StepLeaveConfirm from './StepLeaveConfirm.vue'
import StepSheet from './StepSheet.vue'
import TriggerCard from './TriggerCard.vue'
import { useStepPanel, type PanelTarget } from './useStepPanel'
import { flowIssues } from './validate'
import { usePermission } from '@/composables/usePermission'

/**
 * The visual editor: the triggers, then the steps as a vertical list (a condition forks into
 * two). It edits `flow` in place and reports `change` for every edit that lands in the flow (a
 * structural edit at once, a step's settings when its panel is saved); saving is the page's business.
 * The panel for the open step is docked beside the flow from `lg` up, a sheet below that.
 */
const props = defineProps<{
  flow: Flow
  readonly: boolean
  stats?: AutomationNodeStat[]
  /** Server-reported problems, by step id. */
  problems?: Map<string, string[]>
  /** A draft save is in flight. */
  saving?: boolean
}>()
const emit = defineEmits<{ change: [] }>()
const { t } = useI18n()
const { can } = usePermission()
const { data: lists } = useAllLists()
const route = useRoute()
const router = useRouter()
const docked = useMediaQuery('(min-width: 1024px)')
const panel = useStepPanel(props.flow, () => emit('change'))

const issues = computed(() => flowIssues(props.flow, can('subscribers:sql_query')))
const stats = computed(() => new Map((props.stats ?? []).map((s) => [s.node_id!, s])))
const serverProblems = computed(() => props.problems ?? new Map<string, string[]>())

const highlight = ref<string | null>(null)
const selected = computed(() => panel.target.value?.id ?? null)
const root = ref<HTMLElement>()

provideBuilder({
  readonly: computed(() => props.readonly),
  stats,
  issues,
  problems: serverProblems,
  lookups: {
    list: (id) => lists.value?.find((l) => l.id === id)?.name,
    step: (id) => {
      const loc = locate(props.flow, id)
      return loc?.list[loc.index]
    },
  },
  jumps: computed(() => jumpsInto(props.flow)),
  highlight,
  selected,
  add(list, index, type: StepType) {
    const s = newStep(props.flow, type)
    if (!insertStep(list, index, s)) return
    emit('change')
    // A new step with settings opens straight away; the others are complete as they are.
    if (type !== 'condition' && type !== 'exit') panel.request({ kind: 'step', id: s.id })
  },
  open: (id) => panel.request(props.flow.triggers.some((x) => x.id === id) ? { kind: 'trigger', id } : { kind: 'step', id }),
  remove: (id) => askRemove({ kind: 'step', id }),
  move(id, dir) {
    if (moveStep(props.flow, id, dir)) emit('change')
  },
})

// --- Triggers ---------------------------------------------------------------------------------------------
const triggerOpen = ref(false)
function addTrigger(type: TriggerType) {
  triggerOpen.value = false
  const tr: Trigger = { id: newId(props.flow, 't'), type, config: {} }
  // eslint-disable-next-line vue/no-mutating-props -- the flow is one editable document, owned by the page
  props.flow.triggers.push(tr)
  emit('change')
  if (type !== 'manual') panel.request({ kind: 'trigger', id: tr.id })
}
// --- Deleting ------------------------------------------------------------------------------------------------
const deleting = ref<PanelTarget>()
const deletingName = computed(() => {
  const d = deleting.value
  if (!d) return ''
  const type = d.kind === 'step' ? lookupStep(d.id)?.type : props.flow.triggers.find((x) => x.id === d.id)?.type
  if (!type) return ''
  return t(d.kind === 'step' ? stepMeta[type as StepType].title : triggerMeta[type as TriggerType].title)
})
function lookupStep(id: string) {
  const loc = locate(props.flow, id)
  return loc?.list[loc.index]
}
/** Deleting something with settings asks first; an untouched step or an exit goes at once. */
function askRemove(x: PanelTarget) {
  const configured = x.kind === 'step' ? !!lookupStep(x.id) && hasSettings(lookupStep(x.id)!) : Object.keys(props.flow.triggers.find((t) => t.id === x.id)?.config ?? {}).length > 0
  if (configured) deleting.value = x
  else doRemove(x)
}
function doRemove(x: PanelTarget) {
  deleting.value = undefined
  if (x.kind === 'step') {
    if (removeStep(props.flow, x.id)) emit('change')
    return
  }
  const i = props.flow.triggers.findIndex((t) => t.id === x.id)
  if (i < 0) return
  // eslint-disable-next-line vue/no-mutating-props -- see addTrigger
  props.flow.triggers.splice(i, 1)
  emit('change')
}
const removePanelTarget = () => panel.target.value && askRemove(panel.target.value)
const removeTrigger = (id: string) => askRemove({ kind: 'trigger', id })

// --- The open step in the URL (?step= / ?trigger=) ------------------------------------------------------------
onMounted(() => {
  const { step, trigger } = route.query
  const id = String(step ?? trigger ?? '')
  if (!id) return
  const found = step ? !!lookupStep(id) : props.flow.triggers.some((x) => x.id === id)
  if (found) panel.go({ kind: step ? 'step' : 'trigger', id })
  else void router.replace({ query: { ...route.query, step: undefined, trigger: undefined } })
})
watch(
  () => panel.target.value,
  async (t, old) => {
    const q = { ...route.query, step: t?.kind === 'step' ? t.id : undefined, trigger: t?.kind === 'trigger' ? t.id : undefined }
    if (q.step !== route.query.step || q.trigger !== route.query.trigger) await router.replace({ query: q })
    if (t && t.id !== old?.id) {
      await nextTick()
      root.value?.querySelector(`[data-cy="${t.kind}-${t.id}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  },
)

const leaveName = computed(() => {
  const s = panel.step.value
  const tr = panel.trigger.value
  return t(s ? stepMeta[s.type].title : tr ? triggerMeta[tr.type].title : 'web.automations.panel.delete')
})

defineExpose({
  /** The open panel has edits that are not saved to the flow. */
  panelDirty: panel.dirty,
  savePanel: panel.save,
  /** Runs `proceed` once the panel can be left (after asking, if it has edits). */
  leavePanel: (proceed: () => void) => panel.request(null, proceed),
})
</script>

<template>
  <!-- The row reaches up to the page header and down to the bottom edge (the page's padding is cancelled), so the docked panel fills the space below the header. -->
  <div ref="root" :class="cn('-mt-6 flex items-start', docked && panel.subject.value && '-mb-8 min-h-[calc(var(--page-viewport-h)-var(--page-header-h))]')">
    <div class="flex min-w-0 flex-1 flex-col items-center gap-2 pt-6 pb-8" data-cy="builder">
      <div v-if="$slots.notices" class="w-full space-y-2"><slot name="notices" /></div>
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

    <StepInspector v-if="docked && panel.subject.value" :flow="flow" :panel="panel" :readonly="readonly" :saving="saving" @close="panel.request(null)" @remove="removePanelTarget" />
  </div>
  <StepSheet v-if="!docked" :flow="flow" :panel="panel" :readonly="readonly" :saving="saving" @close="panel.request(null)" @remove="removePanelTarget" />

  <StepLeaveConfirm :open="!!panel.leaving.value" :name="leaveName" @decide="panel.resolve" />
  <ConfirmDialog
    :open="!!deleting"
    destructive
    :title="t('web.automations.panel.deleteTitle', { name: deletingName })"
    :description="t('web.automations.panel.deleteHelp')"
    :confirm-label="t('globals.buttons.delete')"
    @update:open="(o: boolean) => !o && (deleting = undefined)"
    @confirm="doRemove(deleting!)"
  />
</template>
