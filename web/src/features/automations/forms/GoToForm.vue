<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { stepMeta, stepPaths } from '../labels'
import { flowToGraph, goToTargets, locate, type Config, type Flow } from '../model'
import { stepSummary } from '../summary'
import { useBuilder } from '../context'
import { instantLoops } from '../validate'

const props = defineProps<{ flow: Flow; stepId: string; errors: Record<string, string>; disabled?: boolean }>()
const config = defineModel<Config>({ required: true })
const { t } = useI18n()
const b = useBuilder()

// Every step but go tos, in flow order; one on another path is prefixed with that path's headings.
const options = computed(() => {
  const paths = stepPaths(t, props.flow)
  return goToTargets(props.flow, props.stepId).map((s) => {
    const summary = stepSummary(t, s, b.lookups)
    const label = [t(stepMeta[s.type].title), summary].filter(Boolean).join(' · ')
    return { id: s.id, label: paths.get(s.id) ? `${paths.get(s.id)} › ${label}` : label }
  })
})

// A loop with no pause is found on the whole flow, as it would be with the settings being edited here saved.
const loops = computed(() => {
  const copy: Flow = JSON.parse(JSON.stringify(props.flow))
  const loc = locate(copy, props.stepId)
  if (loc) loc.list[loc.index]!.config = config.value
  return instantLoops(flowToGraph(copy)).includes(props.stepId)
})
const target = computed(() => (typeof config.value.target === 'string' ? config.value.target : ''))
const maxRuns = computed(() => (typeof config.value.max_runs === 'number' ? String(config.value.max_runs) : ''))
const setTarget = (v: unknown) => (config.value = { ...config.value, target: String(v ?? '') })
const setRuns = (v: string | number) => {
  const next = { ...config.value }
  if (v === '') delete next.max_runs
  else next.max_runs = Number(v)
  config.value = next
}
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-2">
      <Label for="goto-target">{{ t('web.automations.goTo.continueFrom') }}</Label>
      <Select :model-value="target" :disabled="disabled" @update:model-value="setTarget">
        <SelectTrigger id="goto-target" class="w-full" :aria-invalid="!!errors.target" data-cy="goto-target">
          <SelectValue :placeholder="t('web.automations.goTo.choose')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="o in options" :key="o.id" :value="o.id" :data-cy="`goto-option-${o.id}`">{{ o.label }}</SelectItem>
        </SelectContent>
      </Select>
      <p v-if="errors.target" class="text-sm text-destructive">{{ errors.target }}</p>
      <p v-if="loops" class="text-sm text-destructive" data-cy="goto-loop">{{ t('web.automations.goTo.instantLoop') }}</p>
      <p class="text-xs text-muted-foreground">{{ t('web.automations.goTo.help') }}</p>
    </div>

    <div class="space-y-2">
      <Label for="goto-runs">{{ t('web.automations.goTo.atMost') }}</Label>
      <Input
        id="goto-runs"
        type="number"
        min="1"
        max="100"
        class="w-28"
        :model-value="maxRuns"
        :aria-invalid="!!errors.max_runs"
        :disabled="disabled"
        @update:model-value="setRuns"
      />
      <p v-if="errors.max_runs" class="text-sm text-destructive">{{ errors.max_runs }}</p>
      <p class="text-xs text-muted-foreground">{{ t('web.automations.goTo.maxRunsHelp') }}</p>
    </div>
  </div>
</template>
